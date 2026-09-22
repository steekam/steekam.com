import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const outputRoot = path.resolve(root, 'data/lasso-apple-source');
const metadataFile = path.resolve(root, 'data/lasso-apple-assets.json');
const episodes = [
  ...Array.from({ length: 10 }, (_, index) => ({ season: 1, episode: index + 1, mode: 'bundle' })),
  ...Array.from({ length: 12 }, (_, index) => ({ season: 2, episode: index + 1, mode: 'photo' })),
];
const assets = [];

for (const episode of episodes) {
  const season = String(episode.season).padStart(2, '0');
  const number = String(episode.episode).padStart(2, '0');
  const token = `s${season}e${number}`;
  const sourceUrl = episode.mode === 'bundle'
    ? `https://www.apple.com/tv-pr/shows-and-films/t/ted-lasso/images/seasons-and-episodes/season-${season}/episode-${number}/Ted_Lasso_${season}${number}.zip`
    : `https://www.apple.com/tv-pr/shows-and-films/t/ted-lasso/images/unit-photos/season-${season}/episode-${number}/photo-${season}${number}01/Ted_Lasso_Photo_${season}${number}01.zip`;
  const destination = path.join(outputRoot, token);
  const tempRoot = path.join('/tmp', `lasso-apple-${token}`);
  const zipFile = path.join(tempRoot, `${token}.zip`);
  await mkdir(destination, { recursive: true });
  await mkdir(tempRoot, { recursive: true });

  try {
    const existingImages = (await findFiles(destination, /\.(?:jpg|jpeg|png|webp)$/i)).sort();
    if (existingImages.length) {
      const localFiles = existingImages.map((file) => path.relative(root, file));
      assets.push({ season: episode.season, episode: episode.episode, sourceUrl, files: localFiles, primary: localFiles[0] });
      console.log(`${token}: already downloaded`);
      continue;
    }
    await download(sourceUrl, zipFile);
    await execFileAsync('unzip', ['-q', '-o', zipFile, '-d', tempRoot]);
    const images = (await findFiles(tempRoot, /\.(?:jpg|jpeg|png|webp)$/i))
      .filter((file) => file !== zipFile)
      .sort();
    const localFiles = [];
    for (const [index, image] of images.entries()) {
      const extension = path.extname(image).toLowerCase() || '.jpg';
      const localFile = path.join(destination, `${String(index + 1).padStart(2, '0')}${extension}`);
      await copyFile(image, localFile);
      localFiles.push(path.relative(root, localFile));
    }
    assets.push({ season: episode.season, episode: episode.episode, sourceUrl, files: localFiles, primary: localFiles[0] || null });
    console.log(`${token}: ${localFiles.length} image${localFiles.length === 1 ? '' : 's'}`);
  } catch (error) {
    assets.push({ season: episode.season, episode: episode.episode, sourceUrl, files: [], primary: null, error: error instanceof Error ? error.message : String(error) });
    console.error(`${token}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

await mkdir(path.dirname(metadataFile), { recursive: true });
await writeFile(metadataFile, `${JSON.stringify({ version: 1, provider: 'Apple TV Press', downloadedAt: new Date().toISOString(), assets }, null, 2)}\n`);
console.log(`Metadata: ${path.relative(root, metadataFile)}`);

async function download(url, file) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
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
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findFiles(file, pattern));
    else if (pattern.test(entry.name)) files.push(file);
  }
  return files;
}
