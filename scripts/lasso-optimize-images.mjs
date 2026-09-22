import fg from 'fast-glob';
import sharp from 'sharp';
import { mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const sourcePatterns = [
  'public/images/lasso-apple/**/*.{jpg,jpeg,png}',
  'data/lasso-apple-source/**/*.{jpg,jpeg,png}',
  'public/images/the-lasso-way/*.{jpg,jpeg,png}',
  'data/lasso-art-source/*.{jpg,jpeg,png}',
];

const files = await fg(sourcePatterns, { cwd: root, onlyFiles: true });
let sourceBytes = 0;
let outputBytes = 0;

for (const relativeSource of files) {
  const source = path.resolve(root, relativeSource);
  const relativeOutput = relativeSource
    .replace(/^data\/lasso-apple-source\//, 'public/images/lasso-apple/')
    .replace(/^data\/lasso-art-source\//, 'public/images/the-lasso-way/')
    .replace(/\.(jpe?g|png)$/i, '.webp');
  const output = path.resolve(root, relativeOutput);

  await mkdir(path.dirname(output), { recursive: true });
  await sharp(source)
    .rotate()
    .resize({ width: 1600, withoutEnlargement: true })
    .webp({ quality: 78, effort: 4 })
    .toFile(output);

  sourceBytes += (await stat(source)).size;
  outputBytes += (await stat(output)).size;
}

const saved = sourceBytes ? ((1 - outputBytes / sourceBytes) * 100).toFixed(1) : '0.0';
console.log(`Optimized ${files.length} images.`);
console.log(`Source: ${(sourceBytes / 1024 / 1024).toFixed(1)} MB`);
console.log(`WebP: ${(outputBytes / 1024 / 1024).toFixed(1)} MB (${saved}% smaller)`);
