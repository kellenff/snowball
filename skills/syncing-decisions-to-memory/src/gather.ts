import * as fs from "node:fs";
import * as path from "node:path";
import * as yaml from "js-yaml";

export interface MadrRecord {
  filename: string;
  title: string;
  status: string;
  sourceEventId: string;
  body: string;
}

export interface ObservationRecord {
  sessionId: string;
  timestamp: string;
  type: string;
  confidence: string;
  content: string;
}

export interface GatherResult {
  madrs: MadrRecord[];
  observations: ObservationRecord[];
  warnings: string[];
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

export function parseMadr(filename: string, raw: string): MadrRecord | { warning: string } {
  const m = raw.match(FRONTMATTER_RE);
  if (!m) return { warning: `${filename}: no YAML frontmatter` };

  let fm: unknown;
  try {
    fm = yaml.load(m[1]);
  } catch (err) {
    return { warning: `${filename}: invalid YAML (${(err as Error).message})` };
  }
  if (!fm || typeof fm !== "object")
    return { warning: `${filename}: frontmatter is not a mapping` };

  const obj = fm as Record<string, unknown>;
  const status = typeof obj.status === "string" ? obj.status : "";
  if (!status) return { warning: `${filename}: missing status` };

  const snowball =
    obj.snowball && typeof obj.snowball === "object"
      ? (obj.snowball as Record<string, unknown>)
      : {};
  const sourceEventId =
    typeof snowball.source_event_id === "string" ? snowball.source_event_id : filename;

  return {
    filename,
    title: typeof obj.title === "string" ? obj.title : filename,
    status,
    sourceEventId,
    body: m[2].trim(),
  };
}

const OBS_REQUIRED = ["session_id", "timestamp", "type", "confidence", "content"] as const;

export function parseObservationLine(line: string): ObservationRecord | { warning: string } | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(trimmed) as Record<string, unknown>;
  } catch {
    return { warning: "observations.jsonl: unparseable line" };
  }
  for (const f of OBS_REQUIRED) {
    if (typeof obj[f] !== "string") {
      return { warning: `observations.jsonl: line missing string field '${f}'` };
    }
  }
  return {
    sessionId: obj.session_id as string,
    timestamp: obj.timestamp as string,
    type: obj.type as string,
    confidence: obj.confidence as string,
    content: obj.content as string,
  };
}

export function gatherDecisions(gitRoot: string): GatherResult {
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  const madrs: MadrRecord[] = [];
  const observations: ObservationRecord[] = [];
  const warnings: string[] = [];
  if (!fs.existsSync(dir)) return { madrs, observations, warnings };

  for (const f of fs.readdirSync(dir).sort()) {
    if (!f.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const r = parseMadr(f, raw);
    if ("warning" in r) warnings.push(r.warning);
    else madrs.push(r);
  }

  const jsonlPath = path.join(dir, "observations.jsonl");
  if (fs.existsSync(jsonlPath)) {
    for (const line of fs.readFileSync(jsonlPath, "utf8").split("\n")) {
      const r = parseObservationLine(line);
      if (r === null) continue;
      if ("warning" in r) warnings.push(r.warning);
      else observations.push(r);
    }
  }
  return { madrs, observations, warnings };
}
