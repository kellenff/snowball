import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const MADR_TOOL = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/madr-capture.ts",
);
const OBS_TOOL = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/observation-log.ts",
);
const FIXTURES = path.join(__dirname, "fixtures");

let tmp: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-contract-"));
  const init = spawnSync("git", ["init", "-q"], { cwd: tmp });
  if (init.status !== 0) throw new Error(`git init failed: ${init.stderr.toString()}`);
  fs.mkdirSync(path.join(tmp, ".git"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".git", "HEAD"), "ref: refs/heads/main");
  fs.mkdirSync(path.join(tmp, "docs/snowball/decisions"), { recursive: true });
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function runTool(bin: string, input: unknown): { stdout: string; status: number } {
  const r = spawnSync("bun", ["run", bin], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, status: r.status ?? -1 };
}

function normalizeMadr(s: string): string {
  return s
    .replace(/date: '[^']*'/g, "date: '<NORMALIZED>'")
    .replace(/source_event_id: \S+/g, "source_event_id: <NORMALIZED>")
    .replace(/session_id: \S+/g, "session_id: <NORMALIZED>");
}

function normalizeObs(s: string): string {
  return s
    .replace(/"timestamp":"[^"]*"/g, '"timestamp":"<NORMALIZED>"')
    .replace(/"session_id":"[^"]*"/g, '"session_id":"<NORMALIZED>"');
}

describe("shape parity with hook-bridge output", () => {
  it("madr_capture produces output matching the canonical fixture (modulo normalized fields)", () => {
    const result = runTool(MADR_TOOL, {
      question: "Which approach for the decision spine?",
      options: [
        { name: "A", description: "Skills only" },
        { name: "B", description: "Skills + MCP capture" },
      ],
      chosen: "B",
      context: "We explored three approaches.",
      tags: ["contract-test"],
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const got = normalizeMadr(fs.readFileSync(out.data.path, "utf8"));
    const want = normalizeMadr(fs.readFileSync(path.join(FIXTURES, "canonical-madr.md"), "utf8"));
    expect(got).toBe(want);
  });

  it("observation_log produces output matching the canonical fixture (modulo normalized fields)", () => {
    const result = runTool(OBS_TOOL, {
      content: "we picked approach B because the hook rail doesn't exist on Junie",
      type: "implementation-choice",
      confidence: "high",
      rationale: "the alternative was a wrapper script that would rot",
      related_files: ["extensions/snowball/snowball-capture/src/tools/madr-capture.ts"],
      tags: ["junie", "contract-test"],
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const obsPath = path.join(tmp, "docs/snowball/decisions/observations.jsonl");
    const got = normalizeObs(fs.readFileSync(obsPath, "utf8").trim());
    const want = normalizeObs(
      fs.readFileSync(path.join(FIXTURES, "canonical-observation.jsonl"), "utf8").trim(),
    );
    expect(got).toBe(want);
  });
});
