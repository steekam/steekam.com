import { access, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.cwd(), 'dist');
const internalPaths = [
  'projects/ted-lasso-wisdom/review',
  'data/lasso-review.json',
  'data/lasso-approved.json',
  'data/lasso-scenes.json',
];

for (const relativePath of internalPaths) {
  const target = path.resolve(root, relativePath);
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error(`Invalid internal path: ${relativePath}`);
  try {
    await access(target);
  } catch {
    continue;
  }
  await rm(target, { recursive: true, force: true });
  console.log(`Removed internal production asset: ${relativePath}`);
}
