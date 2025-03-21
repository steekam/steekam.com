import { ObsidianLoader } from "@/lib/obsidian-loader";
import { defineCollection, reference, z } from 'astro:content';

const postSchema = z.object({
    title: z.string(),
    permalink: z.string(),
    excerpt: z.string().optional(),
    created: z.date(),
    published: z.date(),
    tags: z.array(z.string()),
    topics: z.array(z.string()).optional(),
    status: z.string(),
    minutesRead: z.string().optional(),
});

const postWithMentionsSchema = postSchema.extend({
    linkedMentions: z.array(reference('posts')).optional(),
});

export type Post = z.infer<typeof postSchema>;
export type PostWithMentions = z.infer<typeof postWithMentionsSchema>;

const posts = defineCollection({
    loader: ObsidianLoader({
        base: 'Garden',
        pattern: ['**/*.md', '!Templates/**'],
        url: "",
    }),
    schema: postWithMentionsSchema,
});

export const collections = { posts };
