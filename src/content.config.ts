import { ObsidianLoader } from "@/lib/obsidian-loader";
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';

const postSchema = z.object({
    title: z.string(),
    permalink: z.string(),
    excerpt: z.string().optional(),
    created: z.date(),
    published: z.date(),
    updated: z.date().optional(),
    tags: z.array(z.string()),
    topics: z.array(z.string()).default([]).nullable(),
    status: z.array(z.string()).default([]).nullable(),
    minutesRead: z.string().optional(),
    category: z.array(z.string()),
});

export type Post = z.infer<typeof postSchema>;

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
    schema: postSchema,
});

export const collections = { posts };
