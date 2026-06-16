import { describe, expect, it } from "bun:test";
import { ObservationLogInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("observation_log input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = ObservationLogInput.safeParse({
      content: "we picked approach B because...",
      type: "implementation-choice",
      confidence: "high",
      rationale: "the alternative would have meant rewriting the schema",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "nope",
      confidence: "high",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown confidence", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "observation",
      confidence: "maybe",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty content", () => {
    const r = ObservationLogInput.safeParse({
      content: "",
      type: "observation",
      confidence: "low",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional related_files and tags", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "constraint",
      confidence: "medium",
      rationale: "y",
      related_files: ["src/foo.ts", "docs/spec.md"],
      tags: ["brainstorming", "scope"],
    });
    expect(r.success).toBe(true);
  });
});
