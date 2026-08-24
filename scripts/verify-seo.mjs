import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

const dist = path.resolve('dist');
const site = 'https://steekam.me';

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesIn(fullPath));
    else files.push(fullPath);
  }
  return files;
}

function meta(html, attribute, value) {
  const match = html.match(new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]*)"`));
  return match?.[1];
}

function link(html, relation) {
  return html.match(new RegExp(`<link[^>]+rel="${relation}"[^>]+href="([^"]*)"`))?.[1];
}

const files = await filesIn(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
assert.ok(htmlFiles.length, 'No HTML files were generated');

const titles = new Set();
const canonicals = new Set();
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = meta(html, 'name', 'description');
  const canonical = link(html, 'canonical');
  const ogUrl = meta(html, 'property', 'og:url');
  const jsonLdSource = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];

  assert.ok(title, `${file}: missing title`);
  assert.ok(description, `${file}: missing description`);
  assert.ok(canonical?.startsWith(site), `${file}: invalid canonical URL`);
  assert.equal(ogUrl, canonical, `${file}: OG URL differs from canonical`);
  assert.ok(jsonLdSource, `${file}: missing JSON-LD`);
  JSON.parse(jsonLdSource);
  assert.ok(!titles.has(title), `Duplicate title: ${title}`);
  titles.add(title);
  canonicals.add(canonical);

  const isArticle = html.includes('property="og:type" content="article"');
  if (isArticle) {
    const published = meta(html, 'property', 'article:published_time');
    assert.ok(published && !Number.isNaN(Date.parse(published)), `${file}: invalid article publication date`);
  } else {
    assert.ok(!html.includes('property="article:published_time"'), `${file}: non-article has article metadata`);
  }
}

for (const required of ['robots.txt', 'sitemap.xml', 'feed.xml', 'llms.txt', 'llms-full.txt']) {
  assert.ok(files.includes(path.join(dist, required)), `Missing dist/${required}`);
}

const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set();
for (const url of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  sitemapUrls.add(url[1]);
  assert.ok(canonicals.has(url[1]), `Sitemap URL has no HTML canonical: ${url[1]}`);
}
assert.deepEqual(sitemapUrls, canonicals, 'Sitemap URLs do not exactly match HTML canonicals');

const feed = await readFile(path.join(dist, 'feed.xml'), 'utf8');
for (const url of feed.matchAll(/<link>([^<]+)<\/link>/g)) {
  assert.ok(canonicals.has(url[1]), `RSS URL has no HTML canonical: ${url[1]}`);
}

const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
  for (const url of llms.matchAll(/\]\((https:\/\/steekam\.me\/[^)]+\.md)\)/g)) {
  const markdownPath = path.join(dist, new URL(url[1]).pathname.slice(1));
  assert.ok(files.includes(markdownPath), `LLM link has no Markdown file: ${url[1]}`);
}

console.log(`SEO verification passed: ${htmlFiles.length} HTML pages, ${canonicals.size} canonicals.`);
