import type { APIRoute, GetStaticPaths } from 'astro';
import { getCollection } from 'astro:content';
import { postMarkdown } from '@/lib/publishing';

export const prerender = true;

export const getStaticPaths = (async () => {
  const posts = await getCollection('posts');
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }));
}) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) => new Response(postMarkdown(props.post), {
  headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
});
