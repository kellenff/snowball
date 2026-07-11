import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serializePiSession } from "../../skills/decision-logging/scripts/pi-session-reader";

const fixtures = join(import.meta.dir, "fixtures");
const sessionFile = join(fixtures, "sample-session.jsonl");
const expectedFile = join(fixtures, "expected-transcript.jsonl");

describe("serializePiSession", () => {
  test("converts a single-branch session to flat {role, content} JSONL", () => {
    const result = serializePiSession(sessionFile);
    const expected = readFileSync(expectedFile, "utf8");
    expect(result).toBe(expected);
  });

  test("returns empty string for an empty session", () => {
    const emptyFile = join(fixtures, "empty-session.jsonl");
    const result = serializePiSession(emptyFile);
    expect(result).toBe("");
  });

  test("skips image-only entries", () => {
    const imageOnlyFile = join(fixtures, "image-only-session.jsonl");
    const result = serializePiSession(imageOnlyFile);
    expect(result).toBe("");
  });

  test("throws on dangling parentId", () => {
    const danglingFile = join(fixtures, "dangling-parent-session.jsonl");
    expect(() => serializePiSession(danglingFile)).toThrow(/dangling parentId/);
  });

  test("picks the active leaf when multiple roots/branch leaves exist", () => {
    const result = serializePiSession(join(fixtures, "multi-root-session.jsonl"));
    const expected = readFileSync(
      join(fixtures, "expected-multi-root-transcript.jsonl"),
      "utf8",
    );
    expect(result).toBe(expected);
  });
});
