import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { computeAndPersist, computeBlastRadius } from "../../skills/blast-radius/src/compute";

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blast-radius-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  const file = path.join(dir, "README.md");
  fs.writeFileSync(file, "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

describe("computeBlastRadius", () => {
  test("falls back to heuristic when repo is not indexed", async () => {
    const repo = makeTempRepo();
    try {
      const env = await computeBlastRadius({
        gitRoot: repo,
        preset: "design",
        changeSet: { paths: ["skills/foo/SKILL.md", "tests/foo/x.test.ts"] },
      });
      expect(env.status).toBe("degraded");
      expect(env.backend).toBe("heuristic");
      expect(["repo-not-indexed", "graph-unavailable"]).toContain(env.reason);
      expect(env.output?.change_scope.fileCount).toBe(2);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("explicit skip returns degraded with reason", async () => {
    const repo = makeTempRepo();
    try {
      const env = await computeBlastRadius({
        gitRoot: repo,
        preset: "design",
        changeSet: {},
        explicitSkip: true,
      });
      expect(env.status).toBe("degraded");
      expect(env.reason).toBe("explicit-skip");
      expect(env.output).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("computeAndPersist writes scratch file", async () => {
    const repo = makeTempRepo();
    try {
      const { scratchPath } = await computeAndPersist({
        gitRoot: repo,
        preset: "design",
        changeSet: { paths: ["hooks/foo.sh"] },
      });
      expect(fs.existsSync(scratchPath)).toBe(true);
      const parsed = JSON.parse(fs.readFileSync(scratchPath, "utf8"));
      expect(parsed.backend).toBe("heuristic");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});
