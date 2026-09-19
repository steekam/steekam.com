import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dataPath = resolve(root, 'src/components/art-game/artwork-data.json');
const routePath = resolve(root, 'dist/projects/horsin-around-with-art/index.html');
const testPath = resolve(root, 'tests/art-game.spec.mjs');
const reviewDir = resolve(root, 'review-artifacts');
const testResultsDir = resolve(root, 'test-results');
const errors = [];

const fail = (message) => errors.push(message);
const run = (command, args, label) => {
  try {
    const output = execFileSync(command, args, { cwd: root, stdio: 'pipe', encoding: 'utf8' });
    if (/requires the following dependency to be installed/i.test(output)) {
      throw new Error(`${label} dependency missing`);
    }
    console.log(`ART_GAME_${label}: PASS`);
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`.trim().split('\n').slice(-8).join('\n');
    fail(`${label} failed${output ? `\n${output}` : ''}`);
    console.log(`ART_GAME_${label}: FAIL`);
  }
};

const validateContent = () => {
  let entries;
  try { entries = JSON.parse(readFileSync(dataPath, 'utf8')); } catch { fail('Could not parse artwork data JSON'); return; }
  if (!Array.isArray(entries) || entries.length !== 8) fail(`Expected exactly 8 entries, found ${entries?.length ?? 0}`);
  const ids = new Set();
  entries.forEach((entry, index) => {
    if (!entry.id || ids.has(entry.id)) fail(`Entry ${index + 1} has a duplicate or empty id`);
    ids.add(entry.id);
    if (!Array.isArray(entry.choices) || entry.choices.length !== 3 || new Set(entry.choices).size !== 3) fail(`${entry.id}: expected 3 unique choices`);
    if (!Number.isInteger(entry.correctChoice) || !entry.choices[entry.correctChoice]) fail(`${entry.id}: invalid correctChoice`);
    for (const key of ['episode', 'sceneImage', 'sceneAlt', 'artImage', 'artAlt', 'artist', 'title', 'year', 'museum', 'reveal', 'sceneNote', 'artFact', 'imageCredit', 'imageRights', 'imageLicense', 'imageAccessed']) {
      if (typeof entry[key] !== 'string' || !entry[key].trim()) fail(`${entry.id}: missing ${key}`);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.imageAccessed)) fail(`${entry.id}: imageAccessed must be YYYY-MM-DD`);
    if (!Array.isArray(entry.sources) || entry.sources.length < 2) fail(`${entry.id}: needs at least 2 sources`);
    entry.sources?.forEach((source) => {
      if (!source?.label || !/^https:\/\//.test(source.url || '')) fail(`${entry.id}: invalid source URL`);
    });
    for (const asset of [entry.sceneImage, entry.artImage]) if (!existsSync(resolve(root, 'public', asset.replace(/^\//, '')))) fail(`${entry.id}: missing local asset ${asset}`);
  });
  if (errors.length === 0) console.log('ART_GAME_CONTENT: PASS'); else console.log('ART_GAME_CONTENT: FAIL');
};

validateContent();
const runTypeCheck = () => {
  const baseline = [
    { file: 'src/alpinejs-entrypoint.ts', code: '2339', signature: "Property '$persist' does not exist on type 'Alpine'." },
    { file: 'src/alpinejs-entrypoint.ts', code: '7016', signature: "Could not find a declaration file for module '@alpinejs/persist'." },
    { file: 'src/lib/obsidian-loader/utils/errors.ts', code: '7016', signature: "Could not find a declaration file for module 'js-yaml'." },
    { file: 'src/lib/obsidian-loader/utils/render.ts', code: '2578', signature: "Unused '@ts-expect-error' directive." },
  ];
  const stripAnsi = (value) => value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
  let output = '';
  let exitCode = 0;
  try {
    output = execFileSync('npx', ['astro', 'check'], { cwd: root, stdio: 'pipe', encoding: 'utf8' });
  } catch (error) {
    exitCode = error.status || 1;
    output = `${error.stdout || ''}${error.stderr || ''}`;
  }
  const plainOutput = stripAnsi(output);
  if (/requires the following dependency to be installed/i.test(plainOutput)) {
    fail('TYPES dependency missing: @astrojs/check');
    console.log('ART_GAME_TYPES: FAIL');
    return;
  }
  const diagnostics = [...plainOutput.matchAll(/^(\S+):\d+:\d+ - error ts\((\d+)\): (.+)$/gm)]
    .map(([, file, code, message]) => ({ file, code, message }));
  const matchesBaseline = (diagnostic, expected) => diagnostic.file === expected.file
    && diagnostic.code === expected.code
    && diagnostic.message.includes(expected.signature);
  const unknown = diagnostics.filter((diagnostic) => !baseline.some((expected) => matchesBaseline(diagnostic, expected)));
  const completeBaseline = diagnostics.length === baseline.length
    && baseline.every((expected) => diagnostics.some((diagnostic) => matchesBaseline(diagnostic, expected)));
  if (unknown.length || (exitCode && !completeBaseline) || (!exitCode && diagnostics.length)) {
    const details = unknown.map(({ file, code, message }) => `${file} ts(${code}): ${message}`).join('; ');
    fail(`TYPES diagnostics outside baseline: ${details || 'baseline count/signature mismatch'}`);
    console.log('ART_GAME_TYPES: FAIL');
    return;
  }
  if (diagnostics.length) {
    console.log(`ART_GAME_BASELINE_DIAGNOSTICS: ${diagnostics.map(({ file, code }) => `${file} ts(${code})`).join(' | ')}`);
  }
  console.log('ART_GAME_TYPES: PASS');
};
runTypeCheck();
run('npm', ['run', 'build'], 'BUILD');

const staticAcceptance = () => {
  if (!existsSync(routePath)) { fail('Built game route does not exist'); return; }
  const html = readFileSync(routePath, 'utf8');
  const required = ['art-game-root', 'screen-intro', 'screen-play', 'screen-complete', 'start-game', 'answer-option-0', 'reveal-panel', 'gallery-wall', 'replay-game'];
  required.forEach((hook) => { if (!html.includes(`data-testid="${hook}"`)) fail(`Missing data-testid ${hook}`); });
  if (!html.includes('Hockney') || !html.includes('Botticelli')) fail('Built route is missing expected game content');
  if (!existsSync(testPath)) fail('Playwright acceptance test file is missing');
};
staticAcceptance();
let browserAvailable = false;
try {
  await import('@playwright/test');
  browserAvailable = true;
} catch {
  console.log('ART_GAME_E2E: BLOCKED (Playwright is not installed; static route acceptance completed)');
  fail('Browser E2E blocked: @playwright/test is not installed in this workspace');
}
if (browserAvailable) {
  rmSync(reviewDir, { recursive: true, force: true });
  rmSync(testResultsDir, { recursive: true, force: true });
  mkdirSync(reviewDir, { recursive: true });
  run('npx', ['playwright', 'test'], 'E2E');
  const expectedScreenshots = [
    'art-game-desktop-intro.png',
    'art-game-desktop-question.png',
    'art-game-desktop-reveal.png',
    'art-game-desktop-gallery.png',
    'art-game-mobile-question.png',
    'art-game-mobile-reveal.png',
    'art-game-mobile-complete.png',
  ];
  expectedScreenshots.forEach((name) => {
    if (!existsSync(resolve(reviewDir, name))) fail(`Missing deterministic screenshot ${name}`);
  });
  const actualScreenshots = readdirSync(reviewDir).sort();
  const expectedSorted = [...expectedScreenshots].sort();
  if (actualScreenshots.length !== expectedSorted.length || actualScreenshots.some((name, index) => name !== expectedSorted[index])) {
    fail(`Unexpected review artifacts: ${actualScreenshots.join(', ') || 'none'}`);
  }
  if (!errors.length) console.log('ART_GAME_SCREENSHOTS: PASS');
  rmSync(testResultsDir, { recursive: true, force: true });
  if (existsSync(testResultsDir)) fail('Stale Playwright test-results remain after verification');
}

if (errors.length) {
  console.error('\nART_GAME_ERRORS');
  errors.forEach((error) => console.error(`- ${error}`));
  console.log('ART_GAME_ACCEPTANCE: FAIL');
  process.exitCode = 1;
} else {
  console.log('ART_GAME_ACCEPTANCE: PASS');
}
