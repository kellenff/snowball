import * as path from "node:path";
import { describe, expect, test } from "bun:test";
import { analyze } from "../../skills/measuring-skill-performance/src/analyze";

const FIX = path.join(import.meta.dir, "fixtures");

describe("analyze", () => {
  test("produces ranked candidates from a transcript", () => {
    const env = analyze({
      transcriptPaths: [path.join(FIX, "sample-transcript.jsonl")],
      emit: false,
    });
    expect(env.status).toBe("success");
    expect(env.candidates.map((c) => c.skill_name).sort()).toEqual([
      "snowball:blast-radius",
      "snowball:brainstorming",
    ]);
    expect(env.candidates[0].triage_score).toBeGreaterThanOrEqual(env.candidates[1].triage_score);
  });

  test("degrades with no-skill-invocations when there are none", () => {
    const env = analyze({ transcriptPaths: [path.join(FIX, "empty.jsonl")], emit: false });
    expect(env.status).toBe("degraded");
    expect(env.reason).toBe("no-skill-invocations");
  });
});
