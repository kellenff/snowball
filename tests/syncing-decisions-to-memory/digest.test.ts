import { test, expect } from "bun:test";
import { computeDigest } from "../../skills/syncing-decisions-to-memory/src/digest";
import type { FilteredInput } from "../../skills/syncing-decisions-to-memory/src/filter";

const base: FilteredInput = {
  madrs: [
    { filename: "a", title: "A", status: "accepted", sourceEventId: "evt-1", body: "Chose A." },
    { filename: "b", title: "B", status: "accepted", sourceEventId: "evt-2", body: "Chose B." },
  ],
  observations: [
    { sessionId: "s1", timestamp: "t1", type: "constraint", confidence: "high", content: "c1" },
  ],
};

test("digest is 16 lowercase hex chars", () => {
  expect(computeDigest(base)).toMatch(/^[0-9a-f]{16}$/);
});

test("digest is order-independent", () => {
  const shuffled: FilteredInput = {
    madrs: [base.madrs[1], base.madrs[0]],
    observations: base.observations,
  };
  expect(computeDigest(shuffled)).toBe(computeDigest(base));
});

test("editing a decision body changes the digest", () => {
  const edited: FilteredInput = {
    madrs: [base.madrs[0], { ...base.madrs[1], body: "Chose B differently." }],
    observations: base.observations,
  };
  expect(computeDigest(edited)).not.toBe(computeDigest(base));
});

test("adding a record changes the digest", () => {
  const more: FilteredInput = {
    madrs: base.madrs,
    observations: [
      ...base.observations,
      {
        sessionId: "s2",
        timestamp: "t2",
        type: "implementation-choice",
        confidence: "low",
        content: "c2",
      },
    ],
  };
  expect(computeDigest(more)).not.toBe(computeDigest(base));
});
