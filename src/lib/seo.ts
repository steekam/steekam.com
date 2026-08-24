export const SITE_URL = "https://steekam.me";
export const SITE_NAME = "Kamau Wanyee";
export const SITE_DESCRIPTION =
  "Field notes from Kamau Wanyee on building reliable products with React Native, TypeScript, and backend systems.";

export function absoluteUrl(path: string, trailingSlash = false): string {
  const url = new URL(path, SITE_URL);
  if (trailingSlash && url.pathname !== "/" && !url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url.href;
}

export function cleanDescription(value: string, maxLength = 160): string {
  const cleaned = value
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[`*_>#~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

export function descriptionFromBody(body: string, fallback = SITE_DESCRIPTION): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => cleanDescription(part))
    .find(Boolean);
  return paragraph || fallback;
}

export function jsonLdScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

export function wordCount(value: string): number {
  return value.split(/\s+/).filter(Boolean).length;
}
