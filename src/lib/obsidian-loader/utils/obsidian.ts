import { slugify } from "./slugify";

export type ObsidianContext = {
  author?: string;
  files: string[];
  baseUrl: string;
};

export const entryToLink = (
  entry: string,
  context: ObsidianContext,
  permalink?: string
): string => {
  const slug = permalink ?? slugify(entry);
  const baseUrlPart = context.baseUrl ? `/${context.baseUrl}` : "";

  return `${baseUrlPart}/${slug}`;
};

export const resolveDocumentIdByLink = (
  link: string,
  context: ObsidianContext
): string => {
  // return the most precise match
  const matches = context.files.filter((id) => id.includes(link));
  return matches.sort((a, b) => {
    const aMismatch = link.replace(a, "").length;
    const bMismatch = link.replace(b, "").length;

    return bMismatch - aMismatch;
  })[0] as string;
};

export const parseObsidianLink = (
  linkText: string,
  context: ObsidianContext
): { title: string; href: string } => {
  let idHref = linkText;
  let title = linkText.split("/").slice(-1)[0] as string;

  if (linkText.includes("|")) {
    const [aliasHref, aliasTitle] = linkText.split("|");
    idHref = aliasHref as string;
    title = aliasTitle as string;
  }

  const documentId = resolveDocumentIdByLink(idHref, context);

  if (!documentId) {
    console.warn(`Could not find document from Obsidian link "${idHref}"`);
    return {
      title,
      href: `/404?entry=${slugify(idHref)}&collection=${context.baseUrl}`,
    };
  }

  const href = entryToLink(documentId, context);

  return { title, href };
};

/** Rewrite Obsidian [[wikilinks]] to markdown links. */
export const parseObsidianText = (
  content: string,
  context: ObsidianContext
): string => {
  const regex = /\[\[([^\]]+)\]\]/g;
  const matches = content.matchAll(regex);

  for (const match of matches) {
    const [link, obsidianId] = match;
    const obsidianLink = parseObsidianLink(obsidianId as string, context);

    content = content.replace(
      link,
      `[${obsidianLink.title}](${obsidianLink.href})`
    );
  }

  return content;
};
