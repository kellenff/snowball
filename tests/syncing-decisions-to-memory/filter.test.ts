import { test, expect } from "bun:test";
import { filterRecords } from "../../skills/syncing-decisions-to-memory/src/filter";
import type { GatherResult } from "../../skills/syncing-decisions-to-memory/src/gather";

function gather(partial: Partial<GatherResult>): GatherResult {
  return { madrs: [], observations: [], warnings: [], ...partial };
}

test("keeps only accepted/proposed MADRs", () => {
  const out = filterRecords(
    gather({
      madrs: [
        { filename: "a", title: "A", status: "accepted", sourceEventId: "1", body: "x" },
        { filename: "b", title: "B", status: "proposed", sourceEventId: "2", body: "y" },
        { filename: "c", title: "C", status: "superseded", sourceEventId: "3", body: "z" },
        { filename: "d", title: "D", status: "rejected", sourceEventId: "4", body: "w" },
      ],
    }),
  );
  expect(out.madrs.map((m) => m.status).sort()).toEqual(["accepted", "proposed"]);
});

test("keeps observations that are high-confidence OR constraint/implementation-choice", () => {
  const out = filterRecords(
    gather({
      observations: [
        {
          sessionId: "s",
          timestamp: "t1",
          type: "hypothesis",
          confidence: "high",
          content: "kept: high",
        },
        {
          sessionId: "s",
          timestamp: "t2",
          type: "constraint",
          confidence: "low",
          content: "kept: constraint",
        },
        {
          sessionId: "s",
          timestamp: "t3",
          type: "implementation-choice",
          confidence: "medium",
          content: "kept: impl",
        },
        {
          sessionId: "s",
          timestamp: "t4",
          type: "hypothesis",
          confidence: "medium",
          content: "dropped",
        },
      ],
    }),
  );
  expect(out.observations.map((o) => o.content)).toEqual([
    "kept: high",
    "kept: constraint",
    "kept: impl",
  ]);
});
