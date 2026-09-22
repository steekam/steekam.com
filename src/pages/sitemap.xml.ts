import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl } from '@/lib/seo';
import { postLastModified, postUrl } from '@/lib/publishing';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts');
  const topics = [...new Set(posts.flatMap((post) => post.data.topics || []))].sort();
  const latestPostDate = posts.reduce<Date | undefined>((latest, post) => {
    const date = postLastModified(post);
    return !latest || date > latest ? date : latest;
  }, undefined);
  const urls = [
    { loc: absoluteUrl('/', true), lastmod: latestPostDate },
    { loc: absoluteUrl('/topics', true), lastmod: latestPostDate },
    { loc: absoluteUrl('/projects', true), lastmod: latestPostDate },
    { loc: absoluteUrl('/projects/horsin-around-with-art', true), lastmod: new Date('2026-09-19T05:07:43+03:00') },
    { loc: absoluteUrl('/projects/ted-lasso-wisdom', true), lastmod: new Date('2026-09-21T00:00:00+03:00') },
    ...topics.map((topic) => {
      const latest = posts
        .filter((post) => post.data.topics?.includes(topic))
        .reduce<Date | undefined>((current, post) => {
          const date = postLastModified(post);
          return !current || date > current ? date : current;
        }, undefined);
      return { loc: absoluteUrl(`/topics/${topic}`, true), lastmod: latest };
    }),
    ...posts.map((post) => ({ loc: postUrl(post), lastmod: postLastModified(post) })),
  ];
  const body = urls
    .map(({ loc, lastmod }) => `  <url><loc>${loc}</loc>${lastmod ? `<lastmod>${lastmod.toISOString()}</lastmod>` : ''}</url>`)
    .join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
