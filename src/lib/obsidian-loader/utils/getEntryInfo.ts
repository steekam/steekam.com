import matter from "gray-matter";
import path from "node:path";
import { fileURLToPath } from "node:url";
import getReadingTime from "reading-time";

import { isYAMLException, MarkdownError, type ErrorLocation } from "./errors";
import {
  entryToLink,
  parseObsidianText,
  type ObsidianContext,
} from "./obsidian";
import type { Stats } from "node:fs";

function safeParseFrontmatter(source: string, id?: string) {
  try {
    return matter(source);
  } catch (err: any) {
    const markdownError = new MarkdownError({
      name: "MarkdownError",
      message: err.message,
      stack: err.stack,
      location: (id
        ? {
            file: id,
          }
        : undefined) as ErrorLocation,
    });

    if (isYAMLException(err)) {
      markdownError.setLocation({
        file: id,
        line: err.mark.line,
        column: err.mark.column,
      } as ErrorLocation);

      markdownError.setMessage(err.reason);
    }

    throw markdownError;
  }
}

export function getEntryInfo(
  contents: string,
  fileUrl: URL,
  entry: string,
  stats: Stats,
  context: ObsidianContext
) {
  const { content, data, matter } = safeParseFrontmatter(
    contents,
    fileURLToPath(fileUrl)
  );

  data.title = data.title ?? path.basename(entry, path.extname(entry));
  data.permalink = entryToLink(entry, context, data.permalink ?? data.slug);

  data.author = data.author ?? context.author;
  data.created = data.created ?? stats.ctime;

  const body = parseObsidianText(content, context);
  data.minutesRead = getReadingTime(body).text;

  return {
    data,
    body,
    rawData: matter,
  };
}
