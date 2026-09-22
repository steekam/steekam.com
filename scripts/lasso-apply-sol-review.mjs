import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const indexFile = path.resolve(root, 'data/lasso-quote-index.json');
const reviewFile = path.resolve(root, 'public/data/lasso-review.json');
const batchFiles = [
  path.resolve(root, 'data/sol-review-batch-01.json'),
  path.resolve(root, 'data/sol-review-batch-02.json'),
  path.resolve(root, 'data/sol-review-batch-03.json'),
];

const index = JSON.parse(await readFile(indexFile, 'utf8'));
const review = JSON.parse(await readFile(reviewFile, 'utf8'));
const batches = await Promise.all(batchFiles.map(async (file) => JSON.parse(await readFile(file, 'utf8'))));
const decisions = batches.flat();
const decisionById = new Map();

for (const decision of decisions) {
  if (!decision.id || !['keep', 'reject'].includes(decision.status) || decisionById.has(decision.id)) {
    throw new Error(`Invalid or duplicate decision: ${JSON.stringify(decision)}`);
  }
  decisionById.set(decision.id, decision);
}

const sourceIds = new Set(index.candidates.map((candidate) => candidate.id));
for (const decision of decisions) {
  if (!sourceIds.has(decision.id)) throw new Error(`Unknown candidate id: ${decision.id}`);
}

function applyDecisions(document) {
  return {
    ...document,
    candidates: document.candidates.map((candidate) => {
      const decision = decisionById.get(candidate.id);
      return decision ? { ...candidate, status: decision.status } : candidate;
    }),
  };
}

const updatedIndex = applyDecisions(index);
const updatedReview = applyDecisions(review);
const indexStatuses = updatedIndex.candidates.map((candidate) => candidate.status);
const reviewStatuses = updatedReview.candidates.map((candidate) => candidate.status);

if (updatedIndex.candidates.length !== updatedReview.candidates.length) {
  throw new Error('Index and review candidate counts differ');
}
if (indexStatuses.join('|') !== reviewStatuses.join('|')) {
  throw new Error('Index and review statuses differ');
}

const counts = indexStatuses.reduce((result, status) => {
  result[status] = (result[status] || 0) + 1;
  return result;
}, {});
const audit = {
  version: 1,
  reviewedAt: new Date().toISOString(),
  reviewer: 'gpt-5.6-sol',
  method: 'three-batch editorial review of the first-pass keep set',
  criteria: [
    'keep standalone insight, emotional truth, encouragement, or memorable aphorism',
    'reject plot, logistics, preferences, food, sports, team chatter, questions, fragments, and context-dependent lines',
    'preserve quote text and provenance',
  ],
  batchFiles: batchFiles.map((file) => path.relative(root, file)),
  reviewedBatchCount: decisions.length,
  totalCandidateCount: updatedIndex.candidates.length,
  counts,
};

await writeFile(indexFile, `${JSON.stringify(updatedIndex, null, 2)}\n`);
await writeFile(reviewFile, `${JSON.stringify(updatedReview, null, 2)}\n`);
await writeFile(path.resolve(root, 'data/lasso-sol-review-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);

console.log(`Applied ${decisions.length} Sol review decisions.`);
console.log(`Keep: ${counts.keep || 0}; reject: ${counts.reject || 0}.`);
