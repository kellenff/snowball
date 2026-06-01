import * as fs from "node:fs";
import * as path from "node:path";
import { excerptAdrSections, DEFAULT_SECTION_CHAR_CAP, RECALL_SECTIONS } from "./adr-excerpt";
import { recallMadrs } from "./recall-madrs";

export interface PrepareInput {
  gitRoot: string;
  scope?: string;
  maxMadrs?: number;
  sectionCharCap?: number;
}

export interface PrepareOutput {
  source: "adr-file" | "madrs-only" | "empty";
  adrPath: string | null;
  digest: string | null;
  sections: Record<string, string>;
  sectionsTruncated: string[];
  madrs: Array<{
    filename: string;
    title: string;
    status: string;
    excerpt: string;
  }>;
  scope: string | null;
  warnings: string[];
}

function defaultAdrPath(gitRoot: string): string {
  return path.join(gitRoot, ".codebase-memory", "adr.md");
}

export function prepare(input: PrepareInput): PrepareOutput {
  const adrPath = defaultAdrPath(input.gitRoot);
  const scope = input.scope?.trim() || null;
  const cap = input.sectionCharCap ?? DEFAULT_SECTION_CHAR_CAP;

  const madrResult = recallMadrs({
    gitRoot: input.gitRoot,
    scope: scope ?? undefined,
    maxMadrs: input.maxMadrs,
  });

  const base = {
    scope,
    madrs: madrResult.madrs.map(({ filename, title, status, excerpt }) => ({
      filename,
      title,
      status,
      excerpt,
    })),
    warnings: madrResult.warnings,
  };

  if (!fs.existsSync(adrPath)) {
    if (base.madrs.length === 0) {
      return {
        source: "empty",
        adrPath: null,
        digest: null,
        sections: {},
        sectionsTruncated: [],
        ...base,
      };
    }
    return {
      source: "madrs-only",
      adrPath: null,
      digest: null,
      sections: {},
      sectionsTruncated: [],
      ...base,
    };
  }

  const adrContent = fs.readFileSync(adrPath, "utf8");
  const excerpt = excerptAdrSections(adrContent, cap);

  return {
    source: "adr-file",
    adrPath,
    digest: excerpt.digest,
    sections: excerpt.sections as Record<string, string>,
    sectionsTruncated: excerpt.truncated,
    ...base,
  };
}

export function renderExcerptForHook(input: PrepareInput): string {
  const out = prepare(input);
  const lines: string[] = [
    "<project-memory>",
    "Distilled project rationale from codebase-memory ADR and/or on-disk decision logs.",
    "Invoke snowball:recalling-project-context for live MCP recall and scoped graph queries.",
    "",
  ];

  if (out.source === "empty") {
    lines.push(
      "No project ADR on disk (.codebase-memory/adr.md) and no matching decision logs.",
      "After a preserve finish, run syncing-decisions-to-memory to distill decisions into the ADR.",
    );
    lines.push("</project-memory>");
    return lines.join("\n");
  }

  if (out.digest) {
    lines.push(`ADR last synced from decision logs: ${out.digest}`);
    lines.push(
      "Re-run syncing-decisions-to-memory if new decisions were merged since this digest.",
    );
    lines.push("");
  } else if (out.source === "madrs-only") {
    lines.push(
      "No local ADR file — showing recent on-disk MADRs only.",
      "Run syncing-decisions-to-memory after finish to populate .codebase-memory/adr.md.",
    );
    lines.push("");
  }

  for (const name of RECALL_SECTIONS) {
    const body = out.sections[name];
    if (!body) continue;
    lines.push(`## ${name}`);
    if (out.sectionsTruncated.includes(name)) {
      lines.push("(truncated — invoke recalling-project-context for full section)");
    }
    lines.push(body);
    lines.push("");
  }

  if (out.madrs.length > 0) {
    lines.push("## Recent decisions" + (out.scope ? ` (scope: ${out.scope})` : ""));
    for (const m of out.madrs) {
      lines.push(`- **${m.title}** (${m.status}) — ${m.excerpt}`);
    }
    lines.push("");
  }

  lines.push("</project-memory>");
  return lines.join("\n");
}

// CLI:
//   node recall-context.cjs prepare  < {gitRoot, scope?, ...}     > PrepareOutput JSON
//   node recall-context.cjs excerpt  < {gitRoot, scope?, ...}     > plain text for session-start
if (require.main === module) {
  const sub = process.argv[2];
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const input = raw.trim()
        ? (JSON.parse(raw) as PrepareInput)
        : ({ gitRoot: process.cwd() } as PrepareInput);

      if (sub === "prepare") {
        process.stdout.write(JSON.stringify(prepare(input)));
      } else if (sub === "excerpt") {
        process.stdout.write(renderExcerptForHook(input));
      } else {
        process.stderr.write(
          `unknown subcommand: ${String(sub)} (expected 'prepare' or 'excerpt')\n`,
        );
        process.exit(2);
      }
    } catch (err) {
      process.stderr.write(`recall-context error: ${(err as Error).message}\n`);
      process.exit(1);
    }
  });
}
