import {
  parseAdrSections,
  extractDigest,
  digestMarker,
  type CanonicalSection,
} from "../../syncing-decisions-to-memory/src/adr";

export const RECALL_SECTIONS: CanonicalSection[] = [
  "PURPOSE",
  "ARCHITECTURE",
  "TRADEOFFS",
  "PHILOSOPHY",
];

export const DEFAULT_SECTION_CHAR_CAP = 1500;

export interface ExcerptResult {
  sections: Partial<Record<CanonicalSection, string>>;
  truncated: CanonicalSection[];
  digest: string | null;
}

export function excerptAdrSections(content: string, cap = DEFAULT_SECTION_CHAR_CAP): ExcerptResult {
  const parsed = parseAdrSections(content);
  const sections: Partial<Record<CanonicalSection, string>> = {};
  const truncated: CanonicalSection[] = [];
  const digest = extractDigest(content);
  const digestLine = digest ? digestMarker(digest) : null;

  for (const name of RECALL_SECTIONS) {
    let body = parsed[name];
    if (!body) continue;
    if (digestLine) {
      body = body.replace(digestLine, "").trim();
    }
    if (!body) continue;
    if (body.length > cap) {
      sections[name] = `${body.slice(0, cap).trimEnd()}…`;
      truncated.push(name);
    } else {
      sections[name] = body;
    }
  }

  return { sections, truncated, digest };
}
