import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_NAME } from '@/lib/seo';
import { postMarkdown } from '@/lib/publishing';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts'))
    .sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
  const content = [`# ${SITE_NAME} — Full Notes`, '', ...posts.map((post) => postMarkdown(post, '##'))].join('\n');
  return new Response(content, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
