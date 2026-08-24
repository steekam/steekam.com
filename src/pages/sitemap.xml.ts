import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl } from '@/lib/seo';
import { postUrl } from '@/lib/publishing';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = await getCollection('posts');
  const topics = [...new Set(posts.flatMap((post) => post.data.topics || []))].sort();
  const urls = [
    absoluteUrl('/', true),
    absoluteUrl('/topics', true),
    ...topics.map((topic) => absoluteUrl(`/topics/${topic}`, true)),
    ...posts.map(postUrl),
  ];
  const body = urls.map((url) => `  <url><loc>${url}</loc></url>`).join('\n');

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`,
    { headers: { 'Content-Type': 'application/xml; charset=utf-8' } },
  );
};
