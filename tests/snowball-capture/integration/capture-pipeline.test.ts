import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/madr-capture.ts",
);

let tmpDir: string;
let prevCwd: string;

function initGitRepo(dir: string): void {
  fs.mkdirSync(path.join(dir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".git", "HEAD"), "ref: refs/heads/main");
  const result = spawnSync("git", ["init", "-q"], { cwd: dir });
  if (result.status !== 0) {
    throw new Error(`git init failed: ${result.stderr.toString()}`);
  }
}

beforeEach(() => {
  prevCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-junie-madr-"));
  initGitRepo(tmpDir);
  fs.mkdirSync(path.join(tmpDir, "docs/snowball/decisions"), { recursive: true });
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runTool(input: unknown): { stdout: string; stderr: string; status: number } {
  const r = spawnSync("bun", ["run", TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("madr_capture (integration)", () => {
  it("writes a MADR under docs/snowball/decisions/", () => {
    const result = runTool({
      question: "Which approach?",
      options: [
        { name: "A", description: "skills only" },
        { name: "B", description: "skills + MCP capture" },
      ],
      chosen: "B",
      context: "we explored this in the brainstorm",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    expect(fs.existsSync(out.data.path)).toBe(true);
    const content = fs.readFileSync(out.data.path, "utf8");
    expect(content).toContain("Which approach?");
    expect(content).toContain("skills + MCP capture");
    expect(content).toContain("ask-user-question");
    expect(content).toContain("operator");
  });

  it("returns NOT_IN_GIT_REPO when not in a git repo", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-junie-nogit-"));
    const prev = process.cwd();
    process.chdir(other);
    try {
      const result = runTool({
        question: "q",
        options: [
          { name: "A", description: "a" },
          { name: "B", description: "b" },
        ],
        chosen: "A",
      });
      const out = JSON.parse(result.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe("NOT_IN_GIT_REPO");
    } finally {
      process.chdir(prev);
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

// ─── approval_phrase_record ─────────────────────────────────────────

const APPROVAL_TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/approval-phrase-record.ts",
);

function runApprovalTool(input: unknown): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const r = spawnSync("bun", ["run", APPROVAL_TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("approval_phrase_record (integration)", () => {
  it("writes a MADR with user-prompt-pattern mechanism on a matching phrase", () => {
    const result = runApprovalTool({
      phrase: "lgtm",
      action: "approving the design",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const content = fs.readFileSync(out.data.path, "utf8");
    expect(content).toContain("user-prompt-pattern");
    expect(content).toContain("approving the design");
  });

  it("returns NOT_AN_APPROVAL on a non-matching phrase", () => {
    const result = runApprovalTool({
      phrase: "do that thing you mentioned earlier",
      action: "trying to capture a non-approval",
    });
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(false);
    expect(out.code).toBe("NOT_AN_APPROVAL");
  });
});

// ─── observation_log ────────────────────────────────────────────────

const OBSERVATION_TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/observation-log.ts",
);

function runObservationTool(input: unknown): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const r = spawnSync("bun", ["run", OBSERVATION_TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("observation_log (integration)", () => {
  it("appends a single line to observations.jsonl", () => {
    const result = runObservationTool({
      content: "we picked approach B because the hook rail doesn't exist on Junie",
      type: "implementation-choice",
      confidence: "high",
      rationale: "alternative was a wrapper script that would rot",
      tags: ["junie", "scope"],
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const obsPath = path.join(tmpDir, "docs/snowball/decisions/observations.jsonl");
    expect(fs.existsSync(obsPath)).toBe(true);
    const lines = fs.readFileSync(obsPath, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const row = JSON.parse(lines[0]);
    expect(row.content).toContain("approach B");
    expect(row.type).toBe("implementation-choice");
    expect(row.confidence).toBe("high");
    expect(row.source).toBe("agent");
    expect(row.tags).toContain("junie");
  });

  it("two sequential calls do not interleave (single-line JSONL)", () => {
    runObservationTool({
      content: "first",
      type: "observation",
      confidence: "low",
      rationale: "r1",
    });
    runObservationTool({
      content: "second",
      type: "observation",
      confidence: "low",
      rationale: "r2",
    });
    const obsPath = path.join(tmpDir, "docs/snowball/decisions/observations.jsonl");
    const lines = fs.readFileSync(obsPath, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).content).toBe("first");
    expect(JSON.parse(lines[1]).content).toBe("second");
  });
});
