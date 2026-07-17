import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, test } from "bun:test";
import { computeAndPersist } from "../../skills/blast-radius/src/compute";
import {
  buildAuditObservation,
  captureBlastRadiusAudit,
} from "../../skills/blast-radius/src/audit-hook";
import { readLastEnvelope } from "../../skills/blast-radius/src/read-envelope";

function makeTempRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blast-radius-audit-"));
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Test"], { cwd: dir });
  const file = path.join(dir, "README.md");
  fs.writeFileSync(file, "# test\n");
  execFileSync("git", ["add", "README.md"], { cwd: dir });
  execFileSync("git", ["commit", "-qm", "init"], { cwd: dir });
  return dir;
}

describe("readLastEnvelope", () => {
  test("returns null when scratch file missing", () => {
    const repo = makeTempRepo();
    try {
      expect(readLastEnvelope(repo)).toBeNull();
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("reads persisted envelope", async () => {
    const repo = makeTempRepo();
    try {
      await computeAndPersist({
        gitRoot: repo,
        preset: "design",
        changeSet: { paths: ["hooks/foo.sh"] },
      });
      const env = readLastEnvelope(repo);
      expect(env?.backend).toBe("heuristic");
      expect(env?.output?.change_scope.fileCount).toBe(1);
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("captureBlastRadiusAudit", () => {
  test("operator-approval ignores non-approval prompts", async () => {
    const repo = makeTempRepo();
    try {
      await computeAndPersist({
        gitRoot: repo,
        preset: "pre-execution",
        changeSet: { paths: ["hooks/foo.sh"], proposedAction: "git push" },
      });
      const captured = captureBlastRadiusAudit({
        gitRoot: repo,
        sessionId: "s1",
        trigger: "operator-approval",
        prompt: "what about edge cases?",
      });
      expect(captured).toBe(false);
      expect(fs.existsSync(path.join(repo, "docs/snowball/decisions/observations.jsonl"))).toBe(
        false,
      );
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("operator-approval appends observation with blast_radius_envelope", async () => {
    const repo = makeTempRepo();
    try {
      await computeAndPersist({
        gitRoot: repo,
        preset: "pre-execution",
        changeSet: { paths: ["hooks/foo.sh"], proposedAction: "git push" },
      });
      const captured = captureBlastRadiusAudit({
        gitRoot: repo,
        sessionId: "s1",
        trigger: "operator-approval",
        prompt: "lgtm",
      });
      expect(captured).toBe(true);
      const obsPath = path.join(repo, "docs/snowball/decisions/observations.jsonl");
      const line = fs.readFileSync(obsPath, "utf8").trim();
      const obs = JSON.parse(line);
      expect(obs.capture_trigger).toBe("operator-approval");
      expect(obs.blast_radius_envelope.backend).toBe("heuristic");
      expect(obs.tags).toContain("blast-radius");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("stop capture appends observation", async () => {
    const repo = makeTempRepo();
    try {
      await computeAndPersist({
        gitRoot: repo,
        preset: "completion",
        changeSet: { paths: ["skills/foo/SKILL.md"] },
      });
      const captured = captureBlastRadiusAudit({
        gitRoot: repo,
        sessionId: "s2",
        trigger: "stop",
      });
      expect(captured).toBe(true);
      const obs = JSON.parse(
        fs.readFileSync(path.join(repo, "docs/snowball/decisions/observations.jsonl"), "utf8"),
      );
      expect(obs.capture_trigger).toBe("stop");
      expect(obs.session_id).toBe("s2");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });

  test("explicit-skip envelope is still captured", async () => {
    const repo = makeTempRepo();
    try {
      await computeAndPersist({
        gitRoot: repo,
        preset: "pre-execution",
        changeSet: {},
        explicitSkip: true,
      });
      captureBlastRadiusAudit({
        gitRoot: repo,
        sessionId: "s3",
        trigger: "stop",
      });
      const obs = JSON.parse(
        fs.readFileSync(path.join(repo, "docs/snowball/decisions/observations.jsonl"), "utf8"),
      );
      expect(obs.blast_radius_envelope.reason).toBe("explicit-skip");
    } finally {
      fs.rmSync(repo, { recursive: true, force: true });
    }
  });
});

describe("buildAuditObservation", () => {
  test("includes approval phrase in rationale", () => {
    const obs = buildAuditObservation({
      sessionId: "s1",
      trigger: "operator-approval",
      envelope: {
        status: "success",
        backend: "heuristic",
        output: null,
        reason: null,
      },
      prompt: "ship it",
    });
    expect(obs.rationale).toContain("ship it");
    expect(obs.blast_radius_envelope.status).toBe("success");
  });
});
