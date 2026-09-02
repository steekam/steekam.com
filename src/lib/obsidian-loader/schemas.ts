import { z } from "astro/zod";

export const ObsidianDocumentSchema = z.object({
  tags: z.array(z.string()).optional(),
  publish: z.preprocess((val) => {
    if (typeof val === "string") {
      if (val.toLowerCase() === "true") return true;
      if (val.toLowerCase() === "false") return false;
    }
    return val;
  }, z.boolean().optional()),
  permalink: z.string(),
  description: z.string().optional(),
  title: z.string(),
  author: z.string().optional(),
  created: z.date(),
  updated: z.date().optional(),
});

export type ObsidianDocument = z.infer<typeof ObsidianDocumentSchema>;
