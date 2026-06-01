import { describe, expect, test } from "bun:test";
import { percentile } from "../../skills/measuring-skill-performance/src/stats";

describe("percentile (nearest-rank)", () => {
  test("returns 0 for empty input", () => {
    expect(percentile([], 50)).toBe(0);
  });
  test("p50 of 1..10 is the 5th value", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 50)).toBe(5);
  });
  test("p95 of 1..10 is the 10th value", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 95)).toBe(10);
  });
  test("sorts unsorted input first", () => {
    expect(percentile([10, 1, 5], 50)).toBe(5);
  });
});
