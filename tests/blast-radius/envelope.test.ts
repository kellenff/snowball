import { describe, expect, test } from "bun:test";
import { assertEnvelope } from "../../skills/blast-radius/src/envelope";
import { sampleEnvelope } from "./test-helpers";

describe("assertEnvelope", () => {
  test("accepts a success envelope", () => {
    expect(() => assertEnvelope(sampleEnvelope())).not.toThrow();
  });

  test("rejects error envelope with output", () => {
    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "error",
          backend: "none",
          output: null,
          reason: "compute-error",
        }),
      ),
    ).not.toThrow();

    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "error",
          backend: "none",
          output: sampleEnvelope().output,
          reason: "compute-error",
        }),
      ),
    ).toThrow(/null output/);
  });

  test("rejects degraded without output unless explicit-skip", () => {
    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "degraded",
          backend: "heuristic",
          output: null,
          reason: "graph-unavailable",
        }),
      ),
    ).toThrow(/requires output/);

    expect(() =>
      assertEnvelope(
        sampleEnvelope({
          status: "degraded",
          backend: "none",
          output: null,
          reason: "explicit-skip",
        }),
      ),
    ).not.toThrow();
  });
});
