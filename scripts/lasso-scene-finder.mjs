import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const transcriptRoot = path.resolve(root, getOption('--transcripts') || 'data/transcripts');
const indexFile = path.resolve(root, getOption('--index') || 'data/lasso-quote-index.json');
const approvedFile = path.resolve(root, getOption('--approved') || 'public/data/lasso-approved.json');
const manifestFile = path.resolve(root, getOption('--output') || 'data/lasso-scene-manifest.json');
const publicManifestFile = path.resolve(root, getOption('--public-output') || 'public/data/lasso-scenes.json');
const videoRoot = getOption('--video-root') ? path.resolve(root, getOption('--video-root')) : null;
const stillRoot = path.resolve(root, getOption('--stills') || 'public/images/lasso-scenes');

const [index, approved, appleAssetData] = await Promise.all([
  readJson(indexFile),
  readJson(approvedFile),
  readJsonIfPresent(path.resolve(root, 'data/lasso-apple-assets.json')),
]);
const candidatesById = new Map(index.candidates.map((candidate) => [candidate.id, candidate]));
const appleAssets = new Map((appleAssetData?.assets || []).map((asset) => [`${asset.season}x${asset.episode}`, asset]));
const transcriptFiles = await findFiles(transcriptRoot, /\.(?:srt|vtt|txt)$/i);
const transcriptsByPath = new Map();
for (const file of transcriptFiles) {
  transcriptsByPath.set(path.relative(root, file), await parseSubtitleFile(file));
}

const videoFiles = videoRoot ? await findFiles(videoRoot, /\.(?:mp4|mkv|mov|avi|webm)$/i) : [];
const scenes = [];

for (const quote of approved.quotes) {
  const candidate = candidatesById.get(quote.id);
  if (!candidate) throw new Error(`Approved quote is missing from the index: ${quote.id}`);
  const cues = transcriptsByPath.get(candidate.sourcePath);
  if (!cues) throw new Error(`Transcript is missing for ${candidate.sourcePath}`);
  const match = findCueWindow(cues, quote.text);
  const videoFile = findVideo(videoFiles, candidate.season, candidate.episode);
  const appleAsset = appleAssets.get(`${candidate.season}x${candidate.episode}`);
  const sceneId = `${quote.id}-scene`;
  const stillPath = path.join(stillRoot, `${sceneId}.jpg`);
  const scene = {
    id: sceneId,
    quoteId: quote.id,
    text: quote.text,
    season: candidate.season,
    episode: candidate.episode,
    episodeTitle: candidate.episodeTitle,
    sourceName: candidate.sourceName,
    sourcePath: candidate.sourcePath,
    subtitle: match ? {
      start: match.start,
      end: match.end,
      anchor: match.anchor,
      cueIndexes: [match.startIndex, match.endIndex],
      matchedText: match.text,
    } : null,
    video: videoFile ? path.relative(root, videoFile) : null,
    still: null,
    officialStill: appleAsset?.primary ? {
      provider: appleAssetData.provider,
      path: appleAsset.primary,
      sourceUrl: appleAsset.sourceUrl,
    } : null,
  };

  if (match && videoFile) {
    await mkdir(stillRoot, { recursive: true });
    await captureStill(videoFile, match.anchor, stillPath);
    scene.still = path.relative(root, stillPath);
  }
  scenes.push(scene);
}

const manifest = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: path.relative(root, approvedFile),
  videoRoot: videoRoot ? path.relative(root, videoRoot) : null,
  sceneCount: scenes.length,
  matchedSubtitleCount: scenes.filter((scene) => scene.subtitle).length,
  capturedStillCount: scenes.filter((scene) => scene.still).length,
  scenes,
};

await mkdir(path.dirname(manifestFile), { recursive: true });
await mkdir(path.dirname(publicManifestFile), { recursive: true });
await writeFile(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(publicManifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Mapped ${scenes.length} approved quotes.`);
console.log(`Subtitle matches: ${manifest.matchedSubtitleCount}/${manifest.sceneCount}.`);
console.log(`Stills captured: ${manifest.capturedStillCount}/${manifest.sceneCount}.`);
console.log(`Manifest: ${path.relative(root, manifestFile)}`);

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readJsonIfPresent(file) {
  try {
    return await readJson(file);
  } catch {
    return null;
  }
}

async function findFiles(directory, pattern) {
  try {
    await access(directory);
  } catch {
    return [];
  }
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(fullPath, pattern));
    else if (pattern.test(entry.name)) files.push(fullPath);
  }
  return files;
}

async function parseSubtitleFile(file) {
  const raw = await readFile(file, 'utf8');
  return raw
    .replace(/^WEBVTT.*$/im, '')
    .split(/\r?\n\s*\r?\n/)
    .map((block) => {
      const lines = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const timeIndex = lines.findIndex((line) => line.includes('-->'));
      if (timeIndex < 0) return null;
      const [start, end] = lines[timeIndex].split(/\s+--?>\s+/).map(parseTimestamp);
      const text = lines.slice(timeIndex + 1).join(' ').replace(/<[^>]+>/g, ' ');
      return { start, end, text: text.replace(/\s+/g, ' ').trim() };
    })
    .filter((cue) => cue && cue.text);
}

function parseTimestamp(value) {
  const parts = value.replace(',', '.').trim().split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

function findCueWindow(cues, quote) {
  const targetTokens = normalize(quote).split(' ');
  for (let startIndex = 0; startIndex < cues.length; startIndex += 1) {
    const tokens = [];
    for (let endIndex = startIndex; endIndex < Math.min(cues.length, startIndex + 6); endIndex += 1) {
      tokens.push(...normalize(cues[endIndex].text).split(' ').map((token) => ({ token, cueIndex: endIndex })));
      const matchIndex = findTokenSequence(tokens.map(({ token }) => token), targetTokens);
      if (matchIndex >= 0) {
        const quoteStartIndex = tokens[matchIndex].cueIndex;
        const quoteEndIndex = tokens[matchIndex + targetTokens.length - 1].cueIndex;
        const start = cues[quoteStartIndex].start;
        const end = cues[quoteEndIndex].end;
        return {
          start,
          end,
          anchor: Math.min(end - 0.35, start + Math.max(0.35, Math.min(1.5, (end - start) / 2))),
          startIndex: quoteStartIndex,
          endIndex: quoteEndIndex,
          text: cues.slice(quoteStartIndex, quoteEndIndex + 1).map((cue) => cue.text).join(' '),
        };
      }
    }
  }
  return null;
}

function findTokenSequence(tokens, target) {
  for (let index = 0; index <= tokens.length - target.length; index += 1) {
    if (target.every((token, offset) => tokens[index + offset] === token)) return index;
  }
  return -1;
}

function normalize(value) {
  return value
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function findVideo(files, season, episode) {
  const token = `s${String(season).padStart(2, '0')}e${String(episode).padStart(2, '0')}`;
  return files.find((file) => new RegExp(token, 'i').test(path.basename(file))) || null;
}

async function captureStill(videoFile, seconds, outputFile) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-ss', String(seconds),
    '-i', videoFile,
    '-frames:v', '1',
    '-q:v', '2',
    outputFile,
  ]);
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
