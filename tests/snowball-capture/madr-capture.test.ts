import { describe, expect, it } from "bun:test";
import { MadrCaptureInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("madr_capture input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = MadrCaptureInput.safeParse({
      question: "Which approach?",
      options: [
        { name: "A", description: "first option" },
        { name: "B", description: "second option" },
      ],
      chosen: "A",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty question", () => {
    const r = MadrCaptureInput.safeParse({
      question: "",
      options: [
        { name: "A", description: "x" },
        { name: "B", description: "y" },
      ],
      chosen: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rejects fewer than two options", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [{ name: "A", description: "only" }],
      chosen: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than eight options", () => {
    const opts = Array.from({ length: 9 }, (_, i) => ({
      name: `O${i}`,
      description: `desc ${i}`,
    }));
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: opts,
      chosen: "O0",
    });
    expect(r.success).toBe(false);
  });

  it("rejects chosen not present in options", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [
        { name: "A", description: "a" },
        { name: "B", description: "b" },
      ],
      chosen: "C",
    });
    expect(r.success).toBe(false);
  });

  it("accepts context and tags when provided", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [
        { name: "A", description: "a" },
        { name: "B", description: "b" },
      ],
      chosen: "B",
      context: "we discussed this in the meeting",
      tags: ["brainstorming", "approach-selection"],
    });
    expect(r.success).toBe(true);
  });
});
