import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = resolve(root, 'src/components/art-essay/story-data.json');
const routePath = resolve(root, 'dist/projects/horsin-around-with-art/index.html');
const testPath = resolve(root, 'tests/art-essay.spec.mjs');
const reviewDir = resolve(root, 'review-artifacts');
const testResultsDir = resolve(root, 'test-results');
const errors = [];
const fail = (message) => errors.push(message);
const run = (command, args, label) => {
  try {
    const output = execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    if (/requires the following dependency to be installed/i.test(output)) throw new Error(`${label} dependency missing`);
    console.log(`ART_ESSAY_${label}: PASS`);
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-8).join('\n');
    fail(`${label} failed${output ? `\n${output}` : ''}`);
    console.log(`ART_ESSAY_${label}: FAIL`);
  }
};

const validateContent = () => {
  let chapters;
  try { chapters = JSON.parse(readFileSync(dataPath, 'utf8')); } catch { fail('Could not parse essay story data JSON'); return; }
  if (!Array.isArray(chapters) || chapters.length !== 5) fail(`Expected exactly 5 chapters, found ${chapters?.length ?? 0}`);
  const ids = new Set();
  for (const chapter of chapters) {
    if (!chapter.id || ids.has(chapter.id)) fail(`Duplicate or empty chapter id: ${chapter.id || '(empty)'}`);
    ids.add(chapter.id);
    for (const key of ['number', 'season', 'episode', 'location', 'title', 'artist', 'artwork', 'year', 'museum', 'sceneImage', 'sceneAlt', 'artImage', 'artAlt', 'lede', 'story', 'reading', 'sceneCredit', 'artCredit', 'rights']) {
      if (typeof chapter[key] !== 'string' || !chapter[key].trim()) fail(`${chapter.id}: missing ${key}`);
    }
    if (!Array.isArray(chapter.sources) || chapter.sources.length < 2) fail(`${chapter.id}: needs at least 2 sources`);
    for (const source of chapter.sources || []) if (!source?.label || !/^https:\/\//.test(source.url || '')) fail(`${chapter.id}: invalid source URL`);
    for (const asset of [chapter.sceneImage, chapter.artImage]) if (!existsSync(resolve(root, 'public', asset.replace(/^\//, '')))) fail(`${chapter.id}: missing local asset ${asset}`);
    if (chapter.story.split(/\s+/).length < 120 || chapter.story.split(/\s+/).length > 190) fail(`${chapter.id}: story should be 120–180 words`);
    if (!/copyright|public domain/i.test(chapter.rights)) fail(`${chapter.id}: rights note is not explicit`);
  }
  if (errors.length === 0) console.log('ART_ESSAY_CONTENT: PASS'); else console.log('ART_ESSAY_CONTENT: FAIL');
};

validateContent();
const runTypeCheck = () => {
  const baseline = [
    { file: 'src/alpinejs-entrypoint.ts', code: '2339', signature: "Property '$persist' does not exist on type 'Alpine'." },
    { file: 'src/alpinejs-entrypoint.ts', code: '7016', signature: "Could not find a declaration file for module '@alpinejs/persist'." },
    { file: 'src/lib/obsidian-loader/utils/errors.ts', code: '7016', signature: "Could not find a declaration file for module 'js-yaml'." },
    { file: 'src/lib/obsidian-loader/utils/render.ts', code: '2578', signature: "Unused '@ts-expect-error' directive." },
  ];
  let output = '';
  let exitCode = 0;
  try { output = execFileSync('npx', ['astro', 'check'], { cwd: root, stdio: 'pipe', encoding: 'utf8' }); }
  catch (error) { exitCode = error.status || 1; output = `${error.stdout || ''}${error.stderr || ''}`; }
  const plain = output.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  const diagnostics = [...plain.matchAll(/^(\S+):\d+:\d+ - error ts\((\d+)\): (.+)$/gm)].map(([, file, code, message]) => ({ file, code, message }));
  const known = (diagnostic, expected) => diagnostic.file === expected.file && diagnostic.code === expected.code && diagnostic.message.includes(expected.signature);
  const unknown = diagnostics.filter((diagnostic) => !baseline.some((expected) => known(diagnostic, expected)));
  const complete = diagnostics.length === baseline.length && baseline.every((expected) => diagnostics.some((diagnostic) => known(diagnostic, expected)));
  if (unknown.length || (exitCode && !complete) || (!exitCode && diagnostics.length)) {
    fail(`TYPES diagnostics outside baseline: ${unknown.map(({ file, code, message }) => `${file} ts(${code}): ${message}`).join('; ') || 'baseline count/signature mismatch'}`);
    console.log('ART_ESSAY_TYPES: FAIL');
  } else {
    if (diagnostics.length) console.log(`ART_ESSAY_BASELINE_DIAGNOSTICS: ${diagnostics.map(({ file, code }) => `${file} ts(${code})`).join(' | ')}`);
    console.log('ART_ESSAY_TYPES: PASS');
  }
};
runTypeCheck();
run('npm', ['run', 'build'], 'BUILD');

const staticAcceptance = () => {
  if (!existsSync(routePath)) { fail('Built essay route does not exist'); return; }
  const html = readFileSync(routePath, 'utf8');
  for (const hook of ['art-essay-root', 'essay-hero', 'chapter-index', 'chapter-botticelli-venus', 'chapter-hockney-pool', 'chapter-monet-footbridge', 'chapter-millais-ophelia', 'chapter-vangogh-self-portrait', 'coda-title']) if (!html.includes(hook)) fail(`Missing essay hook ${hook}`);
  for (const forbidden of ['start-game', 'answer-option', 'replay-game', 'localStorage', 'gallery-wall', 'Which real artwork']) if (html.includes(forbidden)) fail(`Game-only output remains: ${forbidden}`);
  if (!html.includes('Generated editorial illustration')) fail('Generated interlude label is missing');
  for (const asset of ['threshold-arrival.png', 'threshold-warning.png']) if (!existsSync(resolve(root, 'public/images/horsin-around-with-art/generated', asset))) fail(`Missing generated interlude ${asset}`);
  if (!html.includes('Botticelli') || !html.includes('Hockney') || !html.includes('Millais') || !html.includes('Van Gogh')) fail('Built route is missing expected story content');
  if (!existsSync(testPath)) fail('Playwright essay test file is missing');
};
staticAcceptance();

let browserAvailable = false;
try { await import('@playwright/test'); browserAvailable = true; } catch { fail('Browser E2E blocked: @playwright/test is not installed'); }
if (browserAvailable) {
  rmSync(reviewDir, { recursive: true, force: true });
  rmSync(testResultsDir, { recursive: true, force: true });
  mkdirSync(reviewDir, { recursive: true });
  run('npx', ['playwright', 'test', 'tests/art-essay.spec.mjs'], 'E2E');
  const expected = ['art-essay-desktop-hero.png', 'art-essay-desktop-chapters.png', 'art-essay-mobile.png', 'art-essay-gallery.png', 'art-essay-gallery-dialog.png', 'art-essay-gallery-mobile.png'];
  for (const name of expected) if (!existsSync(resolve(reviewDir, name))) fail(`Missing deterministic screenshot ${name}`);
  const actual = readdirSync(reviewDir).sort();
  if (actual.length !== expected.length || actual.some((name, index) => name !== [...expected].sort()[index])) fail(`Unexpected review artifacts: ${actual.join(', ') || 'none'}`);
  if (!errors.length) console.log('ART_ESSAY_SCREENSHOTS: PASS');
  rmSync(testResultsDir, { recursive: true, force: true });
}

if (errors.length) {
  console.error('\nART_ESSAY_ERRORS');
  errors.forEach((error) => console.error(`- ${error}`));
  console.log('ART_ESSAY_ACCEPTANCE: FAIL');
  process.exitCode = 1;
} else console.log('ART_ESSAY_ACCEPTANCE: PASS');
