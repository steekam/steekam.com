import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

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
  return html.match(new RegExp(`<meta[^>]+${attribute}="${value}"[^>]+content="([^"]*)"`))?.[1];
}

function link(html, relation) {
  return html.match(new RegExp(`<link[^>]+rel="${relation}"[^>]+href="([^"]*)"`))?.[1];
}

function jsonLd(html, file) {
  const source = html.match(/<script type="application\/ld\+json">([^<]+)<\/script>/)?.[1];
  assert.ok(source, `${file}: missing JSON-LD`);
  return JSON.parse(source);
}

function isValidDate(value) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

async function exists(file) {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function assertInternalLinks(html, file) {
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const href = match[1].replaceAll('&amp;', '&');
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    assert.ok(!href.startsWith('/404?entry='), `${file}: unpublished wiki link ${href}`);
    const pathname = decodeURIComponent(href.split(/[?#]/, 1)[0]);
    const target = pathname === '/' ? path.join(dist, 'index.html') : path.join(dist, pathname);
    const candidates = [target, `${target}.html`, path.join(target, 'index.html')];
    const found = await Promise.any(candidates.map(async (candidate) => {
      if (!await exists(candidate)) throw new Error(candidate);
      return candidate;
    })).catch(() => undefined);
    assert.ok(found, `${file}: broken internal link ${href}`);
  }
}

const files = await filesIn(dist);
const htmlFiles = files.filter((file) => file.endsWith('.html'));
assert.ok(htmlFiles.length, 'No HTML files were generated');

const titles = new Set();
const canonicals = new Set();
const indexableCanonicals = new Set();
const articleCanonicals = new Set();
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  const description = meta(html, 'name', 'description');
  const canonical = link(html, 'canonical');
  const ogUrl = meta(html, 'property', 'og:url');
  const graph = jsonLd(html, file)['@graph'];
  const isArticle = meta(html, 'property', 'og:type') === 'article';

  assert.ok(title, `${file}: missing title`);
  assert.ok(description, `${file}: missing description`);
  assert.ok(canonical?.startsWith(`${site}/`), `${file}: invalid canonical URL`);
  assert.equal(ogUrl, canonical, `${file}: OG URL differs from canonical`);
  assert.ok(!titles.has(title), `Duplicate title: ${title}`);
  assert.ok(!canonicals.has(canonical), `Duplicate canonical: ${canonical}`);
  assert.ok(html.includes('<html class="dark" lang="en">'), `${file}: missing document language`);
  assert.ok(meta(html, 'name', 'theme-color'), `${file}: missing theme color`);
  assert.ok(graph.some((item) => item['@type'] === 'Person' && item.sameAs?.includes('https://dev.to/steekam') && item.image), `${file}: incomplete Person entity`);
  await assertInternalLinks(html, file);
  titles.add(title);
  canonicals.add(canonical);
  if (!html.includes('name="robots" content="noindex')) indexableCanonicals.add(canonical);

  if (isArticle) {
    const published = meta(html, 'property', 'article:published_time');
    const ogImage = meta(html, 'property', 'og:image');
    const article = graph.find((item) => item['@type'] === 'BlogPosting');
    assert.ok(isValidDate(published), `${file}: invalid article publication date`);
    assert.ok(description.length >= 50, `${file}: article description is too short`);
    assert.ok(ogImage?.startsWith(`${site}/og/`) && new URL(ogImage).searchParams.has('v'), `${file}: unversioned article OG image`);
    assert.equal(article?.author?.['@id'], `${site}/#person`, `${file}: article author does not use canonical Person`);
    assert.equal(article?.isPartOf?.['@id'], `${site}/#website`, `${file}: article missing WebSite relation`);
    assert.equal(article?.headline, html.match(/<h1[^>]*>([^<]+)<\/h1>/)?.[1], `${file}: JSON-LD headline does not match the visible H1`);
    assert.ok(isValidDate(article?.datePublished), `${file}: invalid JSON-LD publication date`);
    if (article?.dateModified) assert.ok(isValidDate(article.dateModified), `${file}: invalid JSON-LD modified date`);
    articleCanonicals.add(canonical);
  } else {
    assert.ok(!html.includes('property="article:published_time"'), `${file}: non-article has article metadata`);
    assert.ok(!graph.some((item) => item['@type'] === 'BlogPosting'), `${file}: non-article has BlogPosting schema`);
  }
}

const home = await readFile(path.join(dist, 'index.html'), 'utf8');
assert.ok(jsonLd(home, 'home')['@graph'].some((item) => item['@type'] === 'ProfilePage' && item.mainEntity?.['@id'] === `${site}/#person`), 'Home: missing ProfilePage');

for (const required of ['404.html', 'robots.txt', 'sitemap.xml', 'feed.xml', 'llms.txt', 'llms-full.txt', 'site.webmanifest']) {
  assert.ok(files.includes(path.join(dist, required)), `Missing dist/${required}`);
}
assert.match(await readFile(path.join(dist, '404.html'), 'utf8'), /name="robots" content="noindex, follow"/, '404 page must be noindex');

const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8');
const sitemapUrls = new Set();
for (const match of sitemap.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod><\/url>/g)) {
  const [, url, lastmod] = match;
  sitemapUrls.add(url);
  assert.ok(indexableCanonicals.has(url), `Sitemap URL has no indexable HTML canonical: ${url}`);
  assert.ok(isValidDate(lastmod), `Sitemap URL has invalid lastmod: ${url}`);
}
assert.deepEqual(sitemapUrls, indexableCanonicals, 'Sitemap URLs do not exactly match indexable HTML canonicals');

const feed = await readFile(path.join(dist, 'feed.xml'), 'utf8');
assert.match(feed, new RegExp(`<atom:link href="${site}/feed.xml" rel="self" type="application/rss\\+xml"`), 'RSS feed has no Atom self link');
for (const item of feed.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
  const source = item[1];
  const url = source.match(/<link>([^<]+)<\/link>/)?.[1];
  assert.ok(articleCanonicals.has(url), `RSS URL has no article canonical: ${url}`);
  assert.match(source, /<dc:creator>[^<]+<\/dc:creator>/, `RSS item has no author: ${url}`);
  assert.match(source, /<category>[^<]+<\/category>/, `RSS item has no category: ${url}`);
}

const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8');
assert.match(llms, /^# Kamau Wanyee\n/, 'llms.txt has no site H1');
for (const url of llms.matchAll(/\]\((https:\/\/steekam\.me\/[^)]+\.md)\)/g)) {
  const markdownPath = path.join(dist, new URL(url[1]).pathname.slice(1));
  assert.ok(files.includes(markdownPath), `LLM link has no Markdown file: ${url[1]}`);
}
const fullNotes = await readFile(path.join(dist, 'llms-full.txt'), 'utf8');
assert.equal([...fullNotes.matchAll(/^# /gm)].length, 1, 'llms-full.txt must have one document H1');

for (const file of files.filter((file) => file.endsWith('.md'))) {
  const markdown = await readFile(file, 'utf8');
  assert.match(markdown, /^# /, `${file}: missing H1`);
  assert.match(markdown, /^- URL: https:\/\/steekam\.me\/.+\/$/m, `${file}: missing canonical URL`);
  assert.match(markdown, /^- Published: \d{4}-\d{2}-\d{2}T/m, `${file}: missing publication date`);
}

for (const file of files.filter((file) => file.includes(`${path.sep}og${path.sep}`) && file.endsWith('.png'))) {
  const metadata = await sharp(file).metadata();
  assert.equal(metadata.width, 1200, `${file}: incorrect OG image width`);
  assert.equal(metadata.height, 630, `${file}: incorrect OG image height`);
}

const entrypoints = new Set();
for (const file of htmlFiles) {
  const html = await readFile(file, 'utf8');
  for (const source of html.matchAll(/<script type="module" src="([^\"]+)"/g)) {
    entrypoints.add(path.join(dist, source[1]));
  }
}
for (const entrypoint of entrypoints) {
  const { size } = await stat(entrypoint);
  assert.ok(size <= 100 * 1024, `${entrypoint}: page entrypoint exceeds 100 KB`);
}

console.log(`SEO verification passed: ${htmlFiles.length} HTML pages, ${articleCanonicals.size} articles, ${canonicals.size} canonicals.`);
