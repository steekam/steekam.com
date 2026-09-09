import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const site = 'https://steekam.me';
const home = await readFile('dist/index.html', 'utf8');
const article = await readFile('dist/recording-is-a-distributed-system/index.html', 'utf8');
const ogImage = article.match(/property="og:image" content="([^"]+)"/)?.[1];
const urls = [
  `${site}/`,
  `${site}/robots.txt`,
  `${site}/sitemap.xml`,
  `${site}/feed.xml`,
  `${site}/llms.txt`,
  `${site}/projects/`,
  `${site}/recording-is-a-distributed-system/`,
  ogImage,
].filter(Boolean);

if (process.argv.includes('--all-external')) {
  for (const url of home.matchAll(/<a\b[^>]*href="(https?:[^\"]+)"/g)) urls.push(url[1]);
}

const failures = [];
for (const url of [...new Set(urls)]) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    assert.ok(response.ok, `${response.status} ${response.statusText}`);
    if (url === `${site}/robots.txt`) assert.match(await response.text(), /Sitemap: https:\/\/steekam\.me\/sitemap\.xml/);
  } catch (error) {
    failures.push(`${url}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

try {
  const response = await fetch(`${site}/this-url-must-not-exist`, { redirect: 'manual', signal: AbortSignal.timeout(15_000) });
  assert.equal(response.status, 404, `expected a 404 response, received ${response.status}`);
} catch (error) {
  failures.push(`404 check: ${error instanceof Error ? error.message : String(error)}`);
}

assert.deepEqual(failures, [], `Live verification failed:\n${failures.join('\n')}`);
console.log(`Live verification passed: ${urls.length} public URLs and the 404 response.`);
