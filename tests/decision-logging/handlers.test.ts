import { test, expect } from "bun:test";
import * as fs from "node:fs";
import { handleUserPromptApproval } from "../../skills/decision-logging/src/user-prompt-bridge";
import { handleAskUserQuestion } from "../../skills/decision-logging/src/ask-user-question-bridge";
import { normalizeAnswers, normalizeQuestions } from "../../skills/decision-logging/src/hook-payload";
import { makeTempRepo, cleanupTempRepo, readDecisionsDir } from "./test-helpers";

// These cover the pure handlers extracted in Slice 0 so the OpenCode plugin can
// call them in-process with an explicit gitRoot (no stdin, no cwd dependency).

test("handleUserPromptApproval writes an approval MADR for an approval phrase", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleUserPromptApproval({ prompt: "lgtm", sessionId: "s1", gitRoot: repo });
    expect(wrote).toBe(true);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(1);
    const content = fs.readFileSync(`${repo}/docs/snowball/decisions/${files[0]}`, "utf8");
    expect(content).toContain("capture_mechanism: user-prompt-pattern");
    expect(content).toContain("session_id: s1");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleUserPromptApproval no-ops for a non-approval prompt", () => {
  const repo = makeTempRepo();
  try {
    const wrote = handleUserPromptApproval({
      prompt: "what about edge case X",
      sessionId: "s1",
      gitRoot: repo,
    });
    expect(wrote).toBe(false);
    expect(readDecisionsDir(repo).length).toBe(0);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("handleUserPromptApproval uses the explicit gitRoot, not process.cwd()", () => {
  const repo = makeTempRepo();
  const originalCwd = process.cwd();
  try {
    process.chdir("/tmp");
    handleUserPromptApproval({ prompt: "ship it", sessionId: "s2", gitRoot: repo });
    // MADR landed under the explicit repo, even though cwd is elsewhere.
    expect(readDecisionsDir(repo).length).toBe(1);
  } finally {
    process.chdir(originalCwd);
    cleanupTempRepo(repo);
  }
});

test("handleAskUserQuestion writes one MADR per answered question", () => {
  const repo = makeTempRepo();
  try {
    const toolInput = {
      questions: [
        {
          question: "Which storage approach should we use?",
          header: "Storage",
          options: [
            { label: "Two-tier", description: "MADR + JSONL" },
            { label: "Uniform", description: "all MADR" },
          ],
        },
      ],
    };
    const questions = normalizeQuestions(toolInput);
    const answers = normalizeAnswers(
      questions,
      { answers: { "Which storage approach should we use?": "Two-tier" } },
      undefined,
    );
    const count = handleAskUserQuestion({
      questions,
      answers,
      sessionId: "s3",
      sourceEventId: "tooluse-1",
      gitRoot: repo,
    });
    expect(count).toBe(1);
    const files = readDecisionsDir(repo);
    expect(files.length).toBe(1);
    const content = fs.readFileSync(`${repo}/docs/snowball/decisions/${files[0]}`, "utf8");
    expect(content).toContain("capture_mechanism: ask-user-question");
    expect(content).toContain("Two-tier");
  } finally {
    cleanupTempRepo(repo);
  }
});
