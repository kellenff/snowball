import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

export function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-sync-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  return dir;
}

export function cleanupTempRepo(dir: string): void {
  if (dir && dir.startsWith(os.tmpdir())) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

/** Write a file under <repo>/docs/snowball/decisions/, creating dirs. */
export function writeDecisionFile(repo: string, name: string, contents: string): void {
  const dir = path.join(repo, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), contents);
}

/** Build a minimal MADR markdown string for fixtures. */
export function madrFixture(opts: {
  title: string;
  status: string;
  sourceEventId?: string;
  body?: string;
}): string {
  const fm = [
    "---",
    `title: ${opts.title}`,
    `status: ${opts.status}`,
    "date: '2026-05-30T20:35:25.481Z'",
    "deciders:",
    "  - kellen",
    "snowball:",
    "  schema_version: '1.0'",
    "  source: operator",
    "  confidence: high",
    "  capture_mechanism: ask-user-question",
    "  session_id: sess-1",
    `  source_event_id: ${opts.sourceEventId ?? "evt-1"}`,
    "  supersedes: null",
    "  tags:",
    "    - ambient",
    "---",
    "",
    `# ${opts.title}`,
    "",
    "## Decision Outcome",
    "",
    opts.body ?? "Chose the thing.",
    "",
  ];
  return fm.join("\n");
}
