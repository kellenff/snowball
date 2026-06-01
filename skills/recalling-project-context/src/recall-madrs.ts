import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";
import {
  gatherDecisions,
  parseMadr,
  type MadrRecord,
} from "../../syncing-decisions-to-memory/src/gather";
import { filterRecords } from "../../syncing-decisions-to-memory/src/filter";

export interface RecallMadr {
  filename: string;
  title: string;
  status: string;
  excerpt: string;
  mtimeMs: number;
}

export interface RecallMadrsInput {
  gitRoot: string;
  scope?: string;
  maxMadrs?: number;
  excerptChars?: number;
}

export interface RecallMadrsResult {
  madrs: RecallMadr[];
  warnings: string[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

function madrTags(raw: string): string[] {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return [];
  try {
    const fm = yaml.load(m[1]) as Record<string, unknown> | undefined;
    const snowball =
      fm?.snowball && typeof fm.snowball === "object"
        ? (fm.snowball as Record<string, unknown>)
        : {};
    const tags = snowball.tags;
    if (!Array.isArray(tags)) return [];
    return tags.filter((t): t is string => typeof t === "string");
  } catch {
    return [];
  }
}

function normalizeScope(scope: string): string {
  return scope
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
}

export function madrMatchesScope(record: MadrRecord, raw: string, scope: string): boolean {
  const needle = normalizeScope(scope);
  if (!needle) return true;

  const haystacks = [record.filename, record.title, record.body, ...madrTags(raw)].map((s) =>
    s.toLowerCase(),
  );

  return haystacks.some((h) => h.includes(needle));
}

function madrExcerpt(body: string, cap: number): string {
  const trimmed = body.replace(/\s+/g, " ").trim();
  if (trimmed.length <= cap) return trimmed;
  return `${trimmed.slice(0, cap).trimEnd()}…`;
}

export function recallMadrs(input: RecallMadrsInput): RecallMadrsResult {
  const maxMadrs = input.maxMadrs ?? 5;
  const excerptChars = input.excerptChars ?? 400;
  const scope = input.scope?.trim() ?? "";

  const gathered = gatherDecisions(input.gitRoot);
  const filtered = filterRecords(gathered);
  const dir = path.join(input.gitRoot, "docs", "snowball", "decisions");

  const withMeta: Array<{ record: MadrRecord; raw: string; mtimeMs: number }> = [];
  for (const record of filtered.madrs) {
    const filePath = path.join(dir, record.filename);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, "utf8");
    if (scope && !madrMatchesScope(record, raw, scope)) continue;
    withMeta.push({
      record,
      raw,
      mtimeMs: fs.statSync(filePath).mtimeMs,
    });
  }

  withMeta.sort((a, b) => b.mtimeMs - a.mtimeMs);

  const madrs: RecallMadr[] = withMeta.slice(0, maxMadrs).map(({ record, mtimeMs }) => ({
    filename: record.filename,
    title: record.title,
    status: record.status,
    excerpt: madrExcerpt(record.body, excerptChars),
    mtimeMs,
  }));

  return { madrs, warnings: gathered.warnings };
}

/** Warn when frontmatter is malformed but still usable for scope checks. */
export function parseMadrForScope(filename: string, raw: string): MadrRecord | null {
  const r = parseMadr(filename, raw);
  if ("warning" in r) return null;
  return r;
}
