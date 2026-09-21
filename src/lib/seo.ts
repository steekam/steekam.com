import { ENV } from 'varlock/env';

export const SITE_URL = ENV.SITE_URL;
export const SITE_NAME = "Kamau Wanyee";
export const SITE_DESCRIPTION =
  "Field notes from Kamau Wanyee on building reliable products with React Native, TypeScript, and backend systems.";
export const PERSON_ID = `${SITE_URL}/#person`;
export const WEBSITE_ID = `${SITE_URL}/#website`;
export const PERSON = {
  '@type': 'Person',
  '@id': PERSON_ID,
  name: SITE_NAME,
  givenName: 'Kamau',
  familyName: 'Wanyee',
  alternateName: 'steekam',
  description: 'Product-focused full-stack developer writing about reliable React Native, TypeScript, and backend systems.',
  jobTitle: 'Product Developer',
  url: SITE_URL,
  sameAs: [
    'https://github.com/steekam',
    'https://linkedin.com/in/swanyee',
    'https://x.com/mauwanyee',
    'https://dev.to/steekam',
  ],
} as const;

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
    .replace(/[`*_>#~]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).replace(/\s+\S*$/, "")}…`;
}

export function descriptionFromBody(body: string, fallback = SITE_DESCRIPTION): string {
  const paragraph = body
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#{1,6}\s+.*$/gm, '').trim())
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
