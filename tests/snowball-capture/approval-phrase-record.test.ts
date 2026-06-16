import { describe, expect, it } from "bun:test";
import { ApprovalPhraseRecordInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("approval_phrase_record input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "lgtm",
      action: "approving the design",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty phrase", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "",
      action: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty action", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "lgtm",
      action: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional context", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "ship it",
      action: "approving the spec",
      context: "after the user reviewed the design",
    });
    expect(r.success).toBe(true);
  });
});
