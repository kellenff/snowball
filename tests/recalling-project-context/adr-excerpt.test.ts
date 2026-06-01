import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import { excerptAdrSections } from "../../skills/recalling-project-context/src/adr-excerpt";
import { digestMarker } from "../../skills/syncing-decisions-to-memory/src/adr";

test("excerptAdrSections caps long sections and extracts digest", () => {
  const longBody = "x".repeat(2000);
  const content = [
    "## TRADEOFFS",
    "",
    longBody,
    "",
    "## PHILOSOPHY",
    "",
    "Keep hooks passive.",
    "",
    digestMarker("abc123deadbeef01"),
  ].join("\n");

  const out = excerptAdrSections(content, 100);
  expect(out.sections.TRADEOFFS?.endsWith("…")).toBe(true);
  expect(out.sections.TRADEOFFS?.length).toBeLessThanOrEqual(101);
  expect(out.sections.PHILOSOPHY).toBe("Keep hooks passive.");
  expect(out.truncated).toEqual(["TRADEOFFS"]);
  expect(out.digest).toBe("abc123deadbeef01");
});
