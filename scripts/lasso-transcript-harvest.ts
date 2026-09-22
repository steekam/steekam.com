import 'varlock/auto-load';
import { access, mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import {
  createOpenSubtitlesClient,
  OpenSubtitlesAuthenticationError,
  OpenSubtitlesError,
  OpenSubtitlesQuotaError,
  type SubtitleResult,
} from '../src/lib/opensubtitles.ts';
import { createJsonlLogger } from '../src/lib/observability.ts';

const root = process.cwd();
const runId = option('--run-id') ?? randomUUID();
const stage = parseStage(option('--stage') ?? (hasFlag('--download') ? 'all' : 'probe'));
const manifestPath = path.resolve(root, option('--manifest') ?? 'data/transcripts/manifest.json');
const statePath = path.resolve(root, option('--state') ?? 'data/transcripts/harvest-state.json');
const outputDir = path.resolve(root, option('--output-dir') ?? 'data/transcripts');
const logPath = path.resolve(root, option('--log-file') ?? `data/transcripts/logs/harvest-${runId}.jsonl`);
const parentImdbId = numberOption('--parent-imdb-id') ?? 10986410;
const targetLimit = numberOption('--limit');
const probeWorkers = numberOption('--probe-workers') ?? 4;
const downloadWorkers = numberOption('--download-workers') ?? 2;
const force = hasFlag('--force');

const manifest = await readManifest(manifestPath);
const targetSeasons = parseSeasons(option('--seasons')) ?? manifest.seasons;
const selectedEpisodes = manifest.episodes.filter((episode) => targetSeasons.includes(episode.season));
const episodes = targetLimit === undefined ? selectedEpisodes : selectedEpisodes.slice(0, targetLimit);
const state = await readState(statePath, parentImdbId, targetSeasons);
state.seasons = targetSeasons;
state.lastRunId = runId;
state.lastLogPath = path.relative(root, logPath);
const client = createOpenSubtitlesClient();
const logger = await createJsonlLogger({ filePath: logPath, runId, service: 'lasso-transcript-harvest' });
let stateWrites = Promise.resolve();

if (!episodes.length) throw new Error(`No episodes found for seasons ${targetSeasons.join(', ')} in ${path.relative(root, manifestPath)}.`);

try {
  await logger.write({
    event: 'run.started',
    stage,
    episodeCount: episodes.length,
    seasons: targetSeasons,
    parentImdbId,
    probeWorkers,
    downloadWorkers,
    statePath: path.relative(root, statePath),
    logPath: path.relative(root, logPath),
  });

  if (stage === 'probe' || stage === 'all') await runProbe();
  if (stage === 'download' || stage === 'all') await runDownload();

  await persistState();
  await logger.write({ event: 'run.completed', stage, status: 'ok', summary: summarizeState() });
  console.log(`State: ${path.relative(root, statePath)}`);
  console.log(`Log: ${path.relative(root, logPath)}`);
} catch (error) {
  await logger.write({
    event: 'run.failed',
    level: 'error',
    stage,
    status: 'error',
    error: error instanceof Error ? error.message : String(error),
    summary: summarizeState(),
  });
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await logger.flush();
}

async function runProbe(): Promise<void> {
  const queue = episodes.filter((episode) => {
    const current = state.episodes[episodeKey(episode.season, episode.episode)];
    return force || !current || !['probed', 'planned', 'downloaded'].includes(current.status);
  });
  await logger.write({ event: 'stage.started', stage: 'probe', episodeCount: queue.length, workerCount: probeWorkers });
  await runPool(queue, probeWorkers, probeEpisode);
  const failed = queue.filter((episode) => state.episodes[episodeKey(episode.season, episode.episode)]?.status === 'failed').length;
  await logger.write({ event: 'stage.completed', stage: 'probe', status: failed ? 'error' : 'ok', failed, summary: summarizeState() });
  if (failed) throw new Error(`Probe stage failed for ${failed} episode${failed === 1 ? '' : 's'}.`);
}

async function probeEpisode(episode: Episode): Promise<void> {
  const key = episodeKey(episode.season, episode.episode);
  const fields = { stage: 'probe', episodeKey: key, season: episode.season, episode: episode.episode, episodeTitle: episode.episodeTitle };
  state.episodes[key] = { ...state.episodes[key], ...episode, status: 'searching', checkedAt: new Date().toISOString() };
  await persistState();

  try {
    const search = await logger.span('subtitle.search', fields, () => client.searchSubtitles({
      parentImdbId,
      seasonNumber: episode.season,
      episodeNumber: episode.episode,
      languages: ['en'],
      type: 'episode',
    }));
    const ranked = rankSubtitles(search.data, episode.season, episode.episode);
    const selected = ranked[0];

    if (!selected) {
      state.episodes[key] = { ...episode, status: 'missing', checkedAt: new Date().toISOString(), candidateCount: 0 };
      await persistState();
      await logger.write({ ...fields, event: 'episode.probe.missing', status: 'ok', candidateCount: 0 });
      console.log(`${key} ${episode.episodeTitle}: no English subtitle file found.`);
      return;
    }

    state.episodes[key] = {
      ...episode,
      status: 'probed',
      checkedAt: new Date().toISOString(),
      fileId: selected.fileId,
      subtitleId: selected.subtitleId,
      sourceFileName: selected.fileName,
      score: selected.score,
      selection: selected.reasons,
      candidates: ranked.slice(0, 10),
      outputPath: path.relative(root, transcriptPath(episode)),
    };
    await persistState();
    await logger.write({ ...fields, event: 'episode.probe.selected', status: 'ok', candidateCount: ranked.length, fileId: selected.fileId, subtitleId: selected.subtitleId, score: selected.score });
    console.log(`${key} ${episode.episodeTitle}: file ${selected.fileId} (${selected.fileName || 'unnamed'}, score ${selected.score}).`);
  } catch (error) {
    await recordFailure(episode, 'probe', error);
  }
}

async function runDownload(): Promise<void> {
  await authenticate();
  const queue = episodes.filter((episode) => {
    const current = state.episodes[episodeKey(episode.season, episode.episode)];
    const retryAt = current?.quotaBlockedUntil ? Date.parse(current.quotaBlockedUntil) : Number.NEGATIVE_INFINITY;
    const quotaReady = !Number.isFinite(retryAt) || retryAt <= Date.now();
    return Boolean(current?.fileId) && (force || (current?.status !== 'ambiguous' && (current?.status !== 'quota-blocked' || quotaReady)));
  });
  await logger.write({ event: 'stage.started', stage: 'download', episodeCount: queue.length, workerCount: downloadWorkers });
  let halted = false;
  await runPool(queue, downloadWorkers, async (episode) => {
    if (halted) return;
    let operation: 'request' | 'file' = 'request';
    try {
      await downloadEpisode(episode, (nextOperation) => { operation = nextOperation; });
    } catch (error) {
      if (isFatalDownloadError(error, operation)) {
        halted = true;
        client.haltDownloadRequests(error instanceof Error ? error : new Error(String(error)));
      }
      await recordFailure(episode, 'download', error);
    }
  });
  await logger.write({ event: 'stage.completed', stage: 'download', status: halted ? 'error' : 'ok', summary: summarizeState() });
  if (halted) throw new Error('Download stage halted by authentication or quota policy.');
}

async function downloadEpisode(episode: Episode, setOperation: (operation: 'request' | 'file') => void): Promise<void> {
  const key = episodeKey(episode.season, episode.episode);
  const current = state.episodes[key];
  if (!current?.fileId) return;
  const outputPath = transcriptPath(episode);
  if (!force && current.status === 'downloaded' && await fileExists(outputPath)) {
    await logger.write({ event: 'episode.download.skipped', stage: 'download', episodeKey: key, status: 'ok', reason: 'file-exists', outputPath: path.relative(root, outputPath) });
    return;
  }

  if (!force && !current.downloadLink && (current.status === 'download-requesting' || current.status === 'link-acquired' || current.status === 'downloading' || current.status === 'ambiguous')) {
    throw new AmbiguousDownloadError('A previous run may have submitted the download request without saving its link; refusing to spend quota again.');
  }

  let downloadState = current;
  const fields = { stage: 'download', episodeKey: key, season: episode.season, episode: episode.episode, episodeTitle: episode.episodeTitle, fileId: current.fileId, subtitleId: current.subtitleId };
  if (current.downloadLink) {
    if (!force) throw new AmbiguousDownloadError('A temporary download link from an older run is not reusable; choose --force to request a fresh link.');
    const { downloadLink: _downloadLink, ...withoutTemporaryLink } = current;
    downloadState = withoutTemporaryLink;
  }

  state.episodes[key] = { ...downloadState, status: 'download-requesting', outputPath: path.relative(root, outputPath) };
  await persistState();
  const downloadResult = await logger.span('subtitle.download.request', fields, () => client.requestDownload({ fileId: current.fileId as number }));
  const result: DownloadSelection = { link: downloadResult.link, fileName: downloadResult.fileName, remaining: downloadResult.remaining };
  setOperation('file');
  state.episodes[key] = {
    ...state.episodes[key],
    status: 'downloading',
    downloadRequestedAt: new Date().toISOString(),
    remainingDownloads: downloadResult.remaining,
  };
  await persistState();

  setOperation('file');
  await logger.span('subtitle.download.file', fields, () => client.saveTemporarySubtitle(result.link, outputPath));
  state.episodes[key] = {
    ...state.episodes[key],
    status: 'downloaded',
    downloadedAt: new Date().toISOString(),
    downloadedFileName: result.fileName,
    quotaBlockedUntil: undefined,
    error: undefined,
    errorCategory: undefined,
  };
  await persistState();
  await logger.write({ ...fields, event: 'episode.download.completed', status: 'ok', remainingDownloads: result.remaining, outputPath: path.relative(root, outputPath) });
  console.log(`${key} ${episode.episodeTitle}: downloaded ${path.relative(root, outputPath)} (${result.remaining} remaining).`);
}

async function authenticate(): Promise<void> {
  if (client.isAuthenticated) return;
  const username = process.env.OPEN_SUBTITLES_USERNAME;
  const password = process.env.OPEN_SUBTITLES_PASSWORD;
  if (!username || !password) throw new OpenSubtitlesAuthenticationError('Downloads require OPEN_SUBTITLES_TOKEN or OPEN_SUBTITLES_USERNAME and OPEN_SUBTITLES_PASSWORD via Varlock.');
  await logger.span('auth.login', { stage: 'download' }, () => client.login({ username, password }));
}

async function recordFailure(episode: Episode, stageName: 'probe' | 'download', error: unknown): Promise<void> {
  const key = episodeKey(episode.season, episode.episode);
  const message = error instanceof Error ? error.message : String(error);
  const current = state.episodes[key];
  const quotaBlocked = stageName === 'download' && isQuotaError(error);
  const ambiguous = stageName === 'download' && (current?.downloadLink || current?.status === 'download-requesting' || current?.status === 'link-acquired' || current?.status === 'downloading' || current?.status === 'ambiguous');
  const status: HarvestEpisode['status'] = quotaBlocked
    ? 'quota-blocked'
    : ambiguous ? 'ambiguous' : 'failed';
  const next: HarvestEpisode = {
    ...current,
    ...episode,
    status,
    checkedAt: new Date().toISOString(),
    error: message,
    errorCategory: quotaBlocked ? 'quota' : ambiguous ? 'ambiguous' : 'failed',
    quotaBlockedUntil: quotaBlocked ? quotaResetTime(error) : undefined,
  };
  delete next.downloadLink;
  state.episodes[key] = next;
  await persistState();
  await logger.write({ event: 'episode.failed', level: 'error', stage: stageName, episodeKey: key, season: episode.season, episode: episode.episode, error: message, errorCategory: next.errorCategory });
  console.error(`${key} ${episode.episodeTitle}: ${message}`);
}

function isFatalDownloadError(error: unknown, operation: 'request' | 'file'): boolean {
  if (operation !== 'request') return false;
  if (error instanceof OpenSubtitlesAuthenticationError || isQuotaError(error) || error instanceof AmbiguousDownloadError) return true;
  if (!(error instanceof OpenSubtitlesError)) return false;
  return error.status === 401 || error.status === 403;
}

function isQuotaError(error: unknown): error is OpenSubtitlesQuotaError | OpenSubtitlesError {
  if (error instanceof OpenSubtitlesQuotaError) return true;
  return error instanceof OpenSubtitlesError && /quota|download limit|remaining download/i.test(`${error.code ?? ''} ${error.message}`);
}

function quotaResetTime(error: OpenSubtitlesQuotaError | OpenSubtitlesError): string | undefined {
  if (error instanceof OpenSubtitlesQuotaError) return error.resetTimeUtc;
  return `${error.message} ${JSON.stringify(error.details ?? '')}`.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z/)?.[0];
}

function rankSubtitles(results: SubtitleResult[], season: number, episode: number): SelectedSubtitle[] {
  const candidates = results
    .filter((result) => result.attributes.language === 'en')
    .flatMap((result) => (result.attributes.files ?? []).map((file) => {
    const attributes = result.attributes;
    const reasons: string[] = [];
    let score = 0;
    if (attributes.movieHashMatch) { score += 100; reasons.push('movie hash match'); }
    if (attributes.language === 'en') { score += 30; reasons.push('English'); }
    if (attributes.featureDetails?.seasonNumber === season && attributes.featureDetails.episodeNumber === episode) { score += 25; reasons.push('exact episode metadata'); }
    if (attributes.machineTranslated === false) { score += 15; reasons.push('not machine-translated'); }
    if (attributes.aiTranslated === false) { score += 5; reasons.push('not AI-translated'); }
    if (attributes.fromTrusted) { score += 10; reasons.push('trusted source'); }
    if (attributes.hd) { score += 2; reasons.push('HD'); }
    if (attributes.hearingImpaired === false) { score += 1; reasons.push('standard captions'); }
    score += Math.min(attributes.newDownloadCount ?? 0, 10);
    return { fileId: file.fileId, subtitleId: attributes.subtitleId ?? result.id, fileName: file.fileName ?? '', score, reasons };
    }));
  return candidates.sort((a, b) => b.score - a.score || a.fileId - b.fileId);
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>): Promise<void> {
  let nextIndex = 0;
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex++];
      await worker(item);
    }
  }));
}

interface Manifest {
  seasons: number[];
  episodes: Episode[];
}

interface Episode {
  season: number;
  episode: number;
  episodeTitle: string;
}

interface HarvestState {
  version: 1;
  show: { title: string; parentImdbId: number };
  seasons: number[];
  updatedAt: string;
  lastRunId?: string;
  lastLogPath?: string;
  episodes: Record<string, HarvestEpisode>;
}

interface HarvestEpisode extends Episode {
  status: 'searching' | 'probed' | 'planned' | 'download-requesting' | 'link-acquired' | 'downloading' | 'downloaded' | 'missing' | 'failed' | 'ambiguous' | 'quota-blocked';
  checkedAt?: string;
  downloadedAt?: string;
  fileId?: number;
  subtitleId?: string;
  sourceFileName?: string;
  downloadedFileName?: string;
  score?: number;
  selection?: string[];
  candidates?: SelectedSubtitle[];
  candidateCount?: number;
  outputPath?: string;
  downloadLink?: string;
  downloadRequestedAt?: string;
  remainingDownloads?: number;
  quotaBlockedUntil?: string;
  errorCategory?: 'quota' | 'ambiguous' | 'failed';
  error?: string;
}

interface SelectedSubtitle {
  fileId: number;
  subtitleId: string;
  fileName: string;
  score: number;
  reasons: string[];
}

interface DownloadSelection {
  link: string;
  fileName: string;
  remaining: number;
}

class AmbiguousDownloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmbiguousDownloadError';
  }
}

async function readManifest(file: string): Promise<Manifest> {
  const value = JSON.parse(await readFile(file, 'utf8')) as Partial<Manifest>;
  if (!Array.isArray(value.seasons) || !Array.isArray(value.episodes)) throw new Error(`Invalid transcript manifest: ${file}`);
  return { seasons: value.seasons, episodes: value.episodes };
}

async function readState(file: string, id: number, seasons: number[]): Promise<HarvestState> {
  try {
    const value = JSON.parse(await readFile(file, 'utf8')) as HarvestState;
    if (value.version === 1 && value.show.parentImdbId === id) return value;
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }
  return { version: 1, show: { title: 'Ted Lasso', parentImdbId: id }, seasons, updatedAt: new Date().toISOString(), episodes: {} };
}

async function persistState(): Promise<void> {
  state.updatedAt = new Date().toISOString();
  stateWrites = stateWrites.catch(() => undefined).then(() => saveState(statePath, state));
  await stateWrites;
}

async function saveState(file: string, value: HarvestState): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryFile, file);
}

function transcriptPath(episode: Episode): string {
  const title = episode.episodeTitle.replace(/[^a-z0-9]+/gi, ' ').trim().replace(/\s+/g, ' ');
  return path.join(outputDir, `S${String(episode.season).padStart(2, '0')}E${String(episode.episode).padStart(2, '0')} - ${title}.srt`);
}

function episodeKey(season: number, episode: number): string {
  return `S${String(season).padStart(2, '0')}E${String(episode).padStart(2, '0')}`;
}

function parseStage(value: string): 'probe' | 'download' | 'all' {
  if (value === 'probe' || value === 'download' || value === 'all') return value;
  throw new Error('--stage must be probe, download, or all.');
}

function parseSeasons(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const seasons = value.split(',').map((item) => Number(item.trim()));
  if (!seasons.length || seasons.some((season) => !Number.isInteger(season) || season <= 0)) throw new Error('--seasons must be a comma-separated list of positive integers.');
  return [...new Set(seasons)];
}

function numberOption(name: string): number | undefined {
  const value = option(name);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function summarizeState(): Record<string, number> {
  return Object.values(state.episodes).reduce<Record<string, number>>((summary, episode) => {
    summary[episode.status] = (summary[episode.status] ?? 0) + 1;
    return summary;
  }, {});
}
