import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { absoluteUrl, SITE_DESCRIPTION, SITE_NAME } from '@/lib/seo';
import { postDescription, postUrl } from '@/lib/publishing';

export const prerender = true;

export const GET: APIRoute = async () => {
  const posts = (await getCollection('posts'))
    .sort((a, b) => b.data.published.getTime() - a.data.published.getTime());
  const topics = [...new Set(posts.flatMap((post) => post.data.topics || []))].sort();
  const content = [
    `# ${SITE_NAME}`,
    '',
    `> ${SITE_DESCRIPTION}`,
    '',
    'This is a personal site and technical notebook by Kamau Wanyee. Use the Markdown article links for the canonical machine-readable content.',
    '',
    '## Notes',
    '',
    ...posts.map((post) => `- [${post.data.title}](${postUrl(post).replace(/\/$/, '')}.md): ${postDescription(post)}`),
    '',
    '## Topics',
    '',
    ...topics.map((topic) => `- [${topic}](${absoluteUrl(`/topics/${topic}`, true)})`),
    '',
    `- [RSS feed](${absoluteUrl('/feed.xml')})`,
    `- [Full notes export](${absoluteUrl('/llms-full.txt')})`,
    '',
  ].join('\n');

  return new Response(content, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
};
