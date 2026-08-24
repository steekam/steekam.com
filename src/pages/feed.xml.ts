import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { postDescription, postUrl, xmlEscape } from '@/lib/publishing';

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
    </item>`).join('');
  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${SITE_NAME}</title>
    <link>${absoluteUrl('/')}</link>
    <description>${xmlEscape(SITE_DESCRIPTION)}</description>
    <language>en</language>
    <lastBuildDate>${(posts[0]?.data.published || new Date()).toUTCString()}</lastBuildDate>${items}
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
