import { gatherDecisions } from "./gather";
import { filterRecords } from "./filter";
import { computeDigest } from "./digest";
import { writeDiskCache } from "./disk-cache";
import {
  parseAdrSections,
  extractDigest,
  renderAdr,
  OWNED_SECTIONS,
  CANONICAL_SECTIONS,
} from "./adr";

export interface PrepareInput {
  gitRoot: string;
  adrContent: string; // "" when codebase-memory reports no_adr
}

export interface DecisionBrief {
  madrs: Array<{ title: string; status: string; body: string }>;
  observations: Array<{ type: string; confidence: string; content: string }>;
}

export interface PrepareOutput {
  action: "noop" | "synthesize";
  reason: "stale" | "already-current" | "nothing-to-sync";
  digest: string;
  warnings: string[];
  preserved: Record<string, string>;
  brief: DecisionBrief;
}

const EMPTY_BRIEF: DecisionBrief = { madrs: [], observations: [] };

export function prepare(input: PrepareInput): PrepareOutput {
  const gathered = gatherDecisions(input.gitRoot);
  const filtered = filterRecords(gathered);
  const digest = computeDigest(filtered);

  const owned = new Set<string>(OWNED_SECTIONS);
  const sections = parseAdrSections(input.adrContent);
  const preserved: Record<string, string> = {};
  for (const name of CANONICAL_SECTIONS) {
    if (!owned.has(name) && sections[name]) preserved[name] = sections[name];
  }

  const base = { digest, warnings: gathered.warnings, preserved };

  if (filtered.madrs.length === 0 && filtered.observations.length === 0) {
    return { action: "noop", reason: "nothing-to-sync", brief: EMPTY_BRIEF, ...base };
  }
  if (extractDigest(input.adrContent) === digest) {
    return { action: "noop", reason: "already-current", brief: EMPTY_BRIEF, ...base };
  }

  return {
    action: "synthesize",
    reason: "stale",
    brief: {
      madrs: filtered.madrs.map((m) => ({ title: m.title, status: m.status, body: m.body })),
      observations: filtered.observations.map((o) => ({
        type: o.type,
        confidence: o.confidence,
        content: o.content,
      })),
    },
    ...base,
  };
}

export interface RenderCliInput {
  preserved: Record<string, string>;
  tradeoffs: string;
  philosophy: string;
  digest: string;
}

export interface WriteCacheInput {
  gitRoot: string;
  content: string;
}

export function writeCache(input: WriteCacheInput): void {
  writeDiskCache(input.gitRoot, input.content);
}

// CLI:
//   node sync-decisions.cjs prepare      < {gitRoot, adrContent}        > PrepareOutput JSON
//   node sync-decisions.cjs render       < {preserved,tradeoffs,...}    > ADR document text
//   node sync-decisions.cjs write-cache  < {gitRoot, content}           > (writes disk cache)
if (require.main === module) {
  const sub = process.argv[2];
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      if (sub === "prepare") {
        process.stdout.write(JSON.stringify(prepare(JSON.parse(raw) as PrepareInput)));
      } else if (sub === "render") {
        process.stdout.write(renderAdr(JSON.parse(raw) as RenderCliInput));
      } else if (sub === "write-cache") {
        writeCache(JSON.parse(raw) as WriteCacheInput);
      } else {
        process.stderr.write(
          `unknown subcommand: ${String(sub)} (expected 'prepare', 'render', or 'write-cache')\n`,
        );
        process.exit(2);
      }
    } catch (err) {
      process.stderr.write(`sync-decisions error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });
}
