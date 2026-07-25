import { ObsidianLoader } from "@/lib/obsidian-loader";
import { defineCollection, reference } from 'astro:content';
import { z } from 'astro/zod';

const postSchema = z.object({
    title: z.string(),
    permalink: z.string(),
    excerpt: z.string().optional(),
    created: z.date(),
    published: z.date(),
    tags: z.array(z.string()),
    topics: z.array(z.string()).default([]).nullable(),
    status: z.array(z.string()).default([]).nullable(),
    minutesRead: z.string().optional(),
    category: z.array(z.string()),
});

const postWithMentionsSchema = postSchema.extend({
    linkedMentions: z.array(reference('posts')).optional(),
});

export type Post = z.infer<typeof postSchema>;
export type PostWithMentions = z.infer<typeof postWithMentionsSchema>;

const posts = defineCollection({
    loader: ObsidianLoader({
        base: 'Garden',
        pattern: ['**/*.md', '!Templates/**', '!example-notes/**'],
        url: "",
        filter: (data) => {
            if(data.status && Array.isArray(data.status)) {
                return data.status.includes('[[Published]]');
            }

            if(data.category && Array.isArray(data.category)) {
                return data.category.includes('[[Posts]]');
            }
            return false;
        }
    }),
    schema: postWithMentionsSchema,
});

export const collections = { posts };
