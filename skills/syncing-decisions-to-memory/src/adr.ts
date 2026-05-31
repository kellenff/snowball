export const CANONICAL_SECTIONS = [
  "PURPOSE",
  "STACK",
  "ARCHITECTURE",
  "PATTERNS",
  "TRADEOFFS",
  "PHILOSOPHY",
] as const;
export type CanonicalSection = (typeof CANONICAL_SECTIONS)[number];

const CANONICAL_SET = new Set<string>(CANONICAL_SECTIONS);

export const OWNED_SECTIONS: CanonicalSection[] = ["TRADEOFFS", "PHILOSOPHY"];

const DIGEST_RE = /<!--\s*snowball:decisions-digest:sha256:([0-9a-f]{16})\s*-->/;

export function digestMarker(digest: string): string {
  return `<!-- snowball:decisions-digest:sha256:${digest} -->`;
}

export function extractDigest(adrContent: string): string | null {
  const m = adrContent.match(DIGEST_RE);
  return m ? m[1] : null;
}

/** A "## NAME" line is a section boundary only when NAME is exactly canonical. */
function tryCanonicalHeader(line: string): string | null {
  if (!line.startsWith("## ")) return null;
  const name = line.slice(3).replace(/[ \t\r]+$/, "");
  return CANONICAL_SET.has(name) ? name : null;
}

/** Mirror of codebase-memory's cbm_adr_parse_sections (canonical-only, trimmed). */
export function parseAdrSections(content: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!content) return result;

  let current: string | null = null;
  let buf: string[] = [];
  const save = () => {
    if (current) result[current] = buf.join("\n").trim();
  };

  for (const line of content.split("\n")) {
    const header = tryCanonicalHeader(line);
    if (header) {
      save();
      current = header;
      buf = [];
    } else if (current !== null) {
      buf.push(line);
    }
  }
  save();
  return result;
}

export interface RenderInput {
  /** Non-owned canonical sections to preserve verbatim (PURPOSE/STACK/ARCHITECTURE/PATTERNS). */
  preserved: Record<string, string>;
  tradeoffs: string;
  philosophy: string;
  digest: string;
}

export function renderAdr(input: RenderInput): string {
  const sections: Record<string, string> = { ...input.preserved };
  sections.TRADEOFFS = input.tradeoffs.trim();
  sections.PHILOSOPHY = `${input.philosophy.trim()}\n\n${digestMarker(input.digest)}`;

  const parts: string[] = [];
  for (const name of CANONICAL_SECTIONS) {
    const body = sections[name];
    if (body === undefined || body === "") continue;
    parts.push(`## ${name}\n\n${body}`);
  }
  return parts.join("\n\n") + "\n";
}
