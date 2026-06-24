import { test, expect } from "bun:test";
import * as fs from "node:fs";
import { handleApplyPatchObservation } from "../../skills/decision-logging/src/apply-patch-bridge";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("handleApplyPatchObservation appends a file-edit observation", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleApplyPatchObservation({
      toolInput: { patch: "diff --git a/foo b/foo\n@@ -0,0 +1 @@\n+hello\n" },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    expect(wrote).toBe(true);

    const obsFile = `${repo}/docs/snowball/decisions/observations.jsonl`;
    expect(fs.existsSync(obsFile)).toBe(true);

    const lines = fs.readFileSync(obsFile, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const obs = JSON.parse(lines[0]);
    expect(obs.type).toBe("observation");
    expect(obs.content).toContain("foo");
    expect(obs.related_files).toContain("foo");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleApplyPatchObservation no-ops on empty patch", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleApplyPatchObservation({
      toolInput: { patch: "" },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    expect(wrote).toBe(false);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleApplyPatchObservation extracts all touched paths from a multi-file diff", () => {
  const repo = makeTempRepo();
  try {
    handleApplyPatchObservation({
      toolInput: {
        patch:
          "diff --git a/a.txt b/a.txt\n@@ -0,0 +1 @@\n+x\n" +
          "diff --git a/sub/b.txt b/sub/b.txt\n@@ -0,0 +1 @@\n+y\n",
      },
      sessionId: "s1",
      sourceEventId: "tool-1",
      gitRoot: repo,
    });
    const obsFile = `${repo}/docs/snowball/decisions/observations.jsonl`;
    const obs = JSON.parse(fs.readFileSync(obsFile, "utf8").trim());
    expect(obs.related_files.sort()).toEqual(["a.txt", "sub/b.txt"]);
  } finally {
    cleanupTempRepo(repo);
  }
});
