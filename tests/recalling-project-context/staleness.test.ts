import { test, expect } from "bun:test";
import { computeStaleness } from "../../skills/recalling-project-context/src/staleness";

test("computeStaleness returns unknown when adrDigest is null", () => {
  expect(computeStaleness(null, "abc123")).toBe("unknown");
});

test("computeStaleness returns current when digests match", () => {
  expect(computeStaleness("abc123", "abc123")).toBe("current");
});

test("computeStaleness returns stale when digests differ", () => {
  expect(computeStaleness("abc123", "def456")).toBe("stale");
});
