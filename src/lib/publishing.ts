import type { CollectionEntry } from 'astro:content';
import { absoluteUrl, cleanDescription, descriptionFromBody, SITE_NAME } from './seo';

export type PostEntry = CollectionEntry<'posts'>;

export function postUrl(post: PostEntry): string {
  return absoluteUrl(post.data.permalink, true);
}

export function postLastModified(post: PostEntry): Date {
  return post.data.updated ?? post.data.published;
}

export function postOgImage(post: PostEntry): string {
  return absoluteUrl(`/og/${post.id}.png?v=${postLastModified(post).toISOString()}`);
}

export function postDescription(post: PostEntry): string {
  return post.data.excerpt || descriptionFromBody(post.body ?? '', `Notes on ${post.data.title}.`);
}

export function postMarkdown(post: PostEntry, heading = '#'): string {
  const lines = [
    `${heading} ${post.data.title}`,
    '',
    `> ${cleanDescription(postDescription(post), 300)}`,
    '',
    `- URL: ${postUrl(post)}`,
    `- Author: ${SITE_NAME}`,
    `- Published: ${post.data.published.toISOString()}`,
    ...(post.data.updated ? [`- Updated: ${post.data.updated.toISOString()}`] : []),
    ...(post.data.topics?.length ? [`- Topics: ${post.data.topics.join(', ')}`] : []),
    ...(post.data.tags?.length ? [`- Tags: ${post.data.tags.join(', ')}`] : []),
    '',
    post.body?.trim() || '',
    '',
  ];
  return lines.join('\n');
}

export function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
