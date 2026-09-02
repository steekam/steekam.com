import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { postLastModified, postDescription, postUrl, xmlEscape } from '@/lib/publishing';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts'))
    .sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
  const items = posts.map((post) => `
    <item>
      <title>${xmlEscape(post.data.title)}</title>
      <link>${postUrl(post)}</link>
      <guid isPermaLink="true">${postUrl(post)}</guid>
      <description>${xmlEscape(postDescription(post))}</description>
      <pubDate>${post.data.published.toUTCString()}</pubDate>
      <dc:creator>${SITE_NAME}</dc:creator>
      ${[...new Set([...(post.data.topics ?? []), ...post.data.tags])].map((category) => `<category>${xmlEscape(category)}</category>`).join('\n      ')}
    </item>`).join('');
  const lastBuildDate = posts.reduce<Date | undefined>((latest, post) => {
    const date = postLastModified(post);
    return !latest || date > latest ? date : latest;
  }, undefined) ?? new Date();
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${absoluteUrl('/')}</link>
    <atom:link href="${absoluteUrl('/feed.xml')}" rel="self" type="application/rss+xml" />
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>${items}
  </channel>
</rss>
`;

  return new Response(feed, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
};
