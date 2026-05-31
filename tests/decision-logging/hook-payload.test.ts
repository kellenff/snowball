import { test, expect } from "bun:test";
import {
  normalizeAnswers,
  normalizeQuestions,
  parseToolOutput,
  resolveSessionId,
  resolveTranscriptPath,
} from "../../skills/decision-logging/src/hook-payload";

test("resolveSessionId prefers session_id then conversation_id", () => {
  expect(resolveSessionId({ session_id: "s1" })).toBe("s1");
  expect(resolveSessionId({ conversation_id: "c1" })).toBe("c1");
  expect(resolveSessionId({ session_id: "s1", conversation_id: "c1" })).toBe("s1");
});

test("resolveTranscriptPath reads Cursor transcript_path", () => {
  expect(resolveTranscriptPath({ transcript_path: "/tmp/t.jsonl" })).toBe("/tmp/t.jsonl");
  expect(resolveTranscriptPath({ transcript_path: null })).toBe("");
});

test("normalizeQuestions accepts Claude and Cursor question shapes", () => {
  const claude = normalizeQuestions({
    questions: [
      {
        question: "Pick one?",
        header: "Scope",
        options: [{ label: "A", description: "alpha" }],
      },
    ],
  });
  expect(claude).toEqual([
    {
      id: undefined,
      question: "Pick one?",
      header: "Scope",
      options: [{ label: "A", description: "alpha" }],
    },
  ]);

  const cursor = normalizeQuestions({
    questions: [
      {
        id: "scope",
        prompt: "Pick one?",
        options: [{ id: "a", label: "A" }],
      },
    ],
  });
  expect(cursor[0]?.id).toBe("scope");
  expect(cursor[0]?.question).toBe("Pick one?");
});

test("normalizeAnswers reads Claude tool_response and Cursor tool_output", () => {
  const questions = normalizeQuestions({
    questions: [{ question: "Pick one?", options: [{ label: "A" }] }],
  });

  expect(normalizeAnswers(questions, { answers: { "Pick one?": "A" } }, undefined)).toEqual({
    "Pick one?": "A",
  });

  expect(
    normalizeAnswers(questions, undefined, JSON.stringify({ answers: { "Pick one?": "A" } })),
  ).toEqual({ "Pick one?": "A" });
});

test("normalizeAnswers maps Cursor question ids to question text", () => {
  const questions = normalizeQuestions({
    questions: [
      {
        id: "scope",
        prompt: "Which storage approach should we use?",
        options: [
          { id: "two-tier", label: "Two-tier" },
          { id: "uniform", label: "Uniform" },
        ],
      },
    ],
  });

  expect(
    normalizeAnswers(questions, undefined, JSON.stringify({ answers: { scope: "two-tier" } })),
  ).toEqual({ "Which storage approach should we use?": "Two-tier" });
});

test("parseToolOutput accepts object or JSON string", () => {
  expect(parseToolOutput({ ok: true })).toEqual({ ok: true });
  expect(parseToolOutput('{"ok":true}')).toEqual({ ok: true });
  expect(parseToolOutput("not json")).toBeNull();
});
