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
