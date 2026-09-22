import { readdir, readFile, mkdir, rename, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { extractCandidates, isTranscriptFile, parseEpisodeMetadata, rankCandidates } from './lasso-transcript-parser.mjs';

const root = process.cwd();
const command = process.argv[2] || 'index';
const inputDir = path.resolve(root, getOption('--input') || 'data/transcripts');
const outputFile = path.resolve(root, getOption('--output') || 'public/data/lasso-review.json');
const manifestFile = path.resolve(root, getOption('--manifest') || 'data/transcripts/manifest.json');
const indexFile = path.resolve(root, getOption('--index') || 'data/lasso-quote-index.json');

if (command === 'index') {
  await indexTranscripts();
} else if (command === 'sync') {
  await syncTranscripts();
} else if (command === 'export') {
  await exportApproved();
} else {
  console.error('Usage: npm run lasso:harness -- index [--input data/transcripts] [--output public/data/lasso-review.json] [--seasons 1,2,3]');
  console.error('   or: npm run lasso:harness -- sync [--input data/transcripts] [--index data/lasso-quote-index.json] [--seasons 1,2,3]');
  console.error('   or: npm run lasso:harness -- export [--input public/data/lasso-review.json] [--output public/data/lasso-approved.json]');
  process.exitCode = 1;
}

async function indexTranscripts() {
  const index = await buildIndex();
  await writeJson(outputFile, index);

  console.log(`Indexed ${index.transcriptCount} transcript${index.transcriptCount === 1 ? '' : 's'} into ${index.candidateCount} review candidates.`);
  if (index.coverage.expectedCount) console.log(`Coverage: ${index.coverage.foundCount}/${index.coverage.expectedCount} manifest episodes found.`);
  else console.log('Coverage: add data/transcripts/manifest.json to check the full episode set.');
  console.log(`Review file: ${path.relative(root, outputFile)}`);
}

async function syncTranscripts() {
  const fresh = await buildIndex();
  const previous = await readJson(indexFile, { candidates: [] });
  const previousByText = new Map((previous.candidates || []).map((candidate) => [candidate.text.toLowerCase().replace(/\s+/g, ' ').trim(), candidate]));
  const currentKeys = new Set();
  const candidates = fresh.candidates.map((candidate) => {
    const key = candidate.text.toLowerCase().replace(/\s+/g, ' ').trim();
    currentKeys.add(key);
    const old = previousByText.get(key);
    if (!old) return candidate;
    return {
      ...candidate,
      id: old.id || candidate.id,
      status: old.status || candidate.status,
      speaker: old.speaker ?? candidate.speaker,
      situation: old.situation ?? candidate.situation,
      themes: old.themes ?? candidate.themes,
      note: old.note ?? candidate.note,
      visual: old.visual ?? candidate.visual,
      visualAlt: old.visualAlt ?? candidate.visualAlt,
      visualNote: old.visualNote ?? candidate.visualNote,
      reviewedAt: old.reviewedAt,
      metadataEditedAt: old.metadataEditedAt,
    };
  });

  for (const candidate of previous.candidates || []) {
    const key = candidate.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (!currentKeys.has(key) && candidate.status && candidate.status !== 'pending') candidates.push(candidate);
  }

  const synced = {
    ...fresh,
    version: 2,
    syncId: randomUUID(),
    syncedAt: new Date().toISOString(),
    candidateCount: candidates.length,
    candidates: rankCandidates(candidates),
  };
  await writeJson(indexFile, synced);
  await writeJson(outputFile, synced);
  console.log(`Synced ${synced.transcriptCount} transcript${synced.transcriptCount === 1 ? '' : 's'} into ${synced.candidateCount} durable quote candidates.`);
  if (synced.coverage.expectedCount) console.log(`Coverage: ${synced.coverage.foundCount}/${synced.coverage.expectedCount} manifest episodes found.`);
  console.log(`Index: ${path.relative(root, indexFile)}`);
  console.log(`Review file: ${path.relative(root, outputFile)}`);
}

async function buildIndex() {
  const files = await transcriptFiles(inputDir);
  const extractedCandidates = [];

  for (const file of files) {
    const relativePath = path.relative(root, file);
    const sourceName = path.basename(file);
    const raw = await readFile(file, 'utf8');
    extractedCandidates.push(...extractCandidates(raw, sourceName, relativePath));
  }

  const candidates = rankCandidates(extractedCandidates);
  const expectedEpisodes = filterEpisodes(await readManifest(manifestFile), getOption('--seasons'));
  const foundEpisodes = [...new Map(files.map((file) => {
    const metadata = parseEpisodeMetadata(path.basename(file));
    return [`${metadata.season || 'unknown'}x${metadata.episode || 'unknown'}`, metadata];
  })).values()];
  const foundKeys = new Set(foundEpisodes.map((episode) => `${episode.season}x${episode.episode}`));
  const missingEpisodes = expectedEpisodes.filter((episode) => !foundKeys.has(`${episode.season}x${episode.episode}`));

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    sourceRoot: path.relative(root, inputDir),
    transcriptCount: files.length,
    extractedCandidateCount: extractedCandidates.length,
    candidateCount: candidates.length,
    duplicateCount: extractedCandidates.length - candidates.length,
    coverage: {
      expectedCount: expectedEpisodes.length || null,
      foundCount: foundEpisodes.filter((episode) => episode.season && episode.episode).length,
      missingEpisodes,
    },
    candidates,
  };
}

async function exportApproved() {
  const inputFile = path.resolve(root, getOption('--input') || 'public/data/lasso-review.json');
  const approvedFile = path.resolve(root, getOption('--output') || 'public/data/lasso-approved.json');
  const auditFile = path.resolve(root, getOption('--audit') || 'data/lasso-approved-audit.json');
  const review = JSON.parse(await readFile(inputFile, 'utf8'));
  const kept = (Array.isArray(review) ? review : review.candidates || [])
    .filter((candidate) => candidate.status === 'keep');
  const approved = kept.map(toPublicQuote);
  const audit = kept.map(toAuditQuote);

  await mkdir(path.dirname(approvedFile), { recursive: true });
  await mkdir(path.dirname(auditFile), { recursive: true });
  await writeFile(approvedFile, `${JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    source: path.relative(root, inputFile),
    quoteCount: approved.length,
    quotes: approved,
  }, null, 2)}\n`);
  await writeFile(auditFile, `${JSON.stringify({
    version: 1,
    exportedAt: new Date().toISOString(),
    source: path.relative(root, inputFile),
    quoteCount: audit.length,
    quotes: audit,
  }, null, 2)}\n`);

  console.log(`Exported ${approved.length} approved quote${approved.length === 1 ? '' : 's'}.`);
  console.log(`Approved bundle: ${path.relative(root, approvedFile)}`);
  console.log(`Local audit: ${path.relative(root, auditFile)}`);
}

function toPublicQuote(candidate) {
  return {
    id: candidate.id,
    text: candidate.text,
    speaker: candidate.speaker || '',
    season: candidate.season,
    episode: candidate.episode,
    episodeTitle: candidate.episodeTitle || '',
    situation: candidate.situation || '',
    themes: candidate.themes || [],
    visual: candidate.visual || '',
    visualAlt: candidate.visualAlt || '',
    visualNote: candidate.visualNote || '',
    status: 'approved',
  };
}

function toAuditQuote(candidate) {
  return {
    ...toPublicQuote(candidate),
    sourceName: candidate.sourceName,
    sourcePath: candidate.sourcePath,
    context: candidate.context || '',
    score: candidate.score,
    rank: candidate.rank,
    provenance: candidate.provenance || [],
    duplicateCount: candidate.duplicateCount || 0,
    reviewedAt: candidate.reviewedAt || '',
    metadataEditedAt: candidate.metadataEditedAt || '',
  };
}

async function transcriptFiles(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return transcriptFiles(fullPath);
      return isTranscriptFile(entry.name) ? [fullPath] : [];
    }));
    return nested.flat().sort();
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporaryFile = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporaryFile, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporaryFile, file);
}

function filterEpisodes(episodes, value) {
  if (!value) return episodes;
  const seasons = value.split(',').map((item) => Number(item.trim())).filter(Number.isInteger);
  return episodes.filter((episode) => seasons.includes(episode.season));
}

async function readManifest(file) {
  try {
    const parsed = JSON.parse(await readFile(file, 'utf8'));
    return Array.isArray(parsed) ? parsed : parsed.episodes || [];
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
