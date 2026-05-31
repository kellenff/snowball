import { test, expect } from "bun:test";
import {
  parseAdrSections,
  extractDigest,
  digestMarker,
  renderAdr,
  CANONICAL_SECTIONS,
  OWNED_SECTIONS,
} from "../../skills/syncing-decisions-to-memory/src/adr";

test("parseAdrSections keeps only canonical sections, trims content", () => {
  const doc = [
    "## PURPOSE",
    "",
    "Do the thing.",
    "",
    "## ARCHITECTURE",
    "Layers.",
    "## TRADEOFFS",
    "Chose X.",
    "",
  ].join("\n");
  const s = parseAdrSections(doc);
  expect(s.PURPOSE).toBe("Do the thing.");
  expect(s.ARCHITECTURE).toBe("Layers.");
  expect(s.TRADEOFFS).toBe("Chose X.");
});

test("parseAdrSections absorbs a non-canonical header into the current section", () => {
  const doc = ["## TRADEOFFS", "Chose X.", "## DECISIONS", "this is not a real section", ""].join(
    "\n",
  );
  const s = parseAdrSections(doc);
  // "## DECISIONS" is NOT canonical, so its line + body stay inside TRADEOFFS.
  expect(s.DECISIONS).toBeUndefined();
  expect(s.TRADEOFFS).toContain("Chose X.");
  expect(s.TRADEOFFS).toContain("## DECISIONS");
  expect(s.TRADEOFFS).toContain("this is not a real section");
});

test("parseAdrSections is case-sensitive on section names", () => {
  const doc = ["## Tradeoffs", "lower", "## TRADEOFFS", "upper"].join("\n");
  const s = parseAdrSections(doc);
  expect(s.TRADEOFFS).toBe("upper");
  expect(Object.keys(s)).toEqual(["TRADEOFFS"]);
});

test("parseAdrSections returns empty for empty input", () => {
  expect(parseAdrSections("")).toEqual({});
});

test("extractDigest pulls a stored 16-hex digest, else null", () => {
  expect(extractDigest(`text ${digestMarker("a1b2c3d4e5f6a7b8")} more`)).toBe("a1b2c3d4e5f6a7b8");
  expect(extractDigest("no marker here")).toBeNull();
});

test("renderAdr preserves structural sections, replaces owned, appends marker, canonical order", () => {
  const out = renderAdr({
    preserved: { ARCHITECTURE: "Layers.", PURPOSE: "Do the thing." },
    tradeoffs: "Chose X over Y because Z.",
    philosophy: "Prefer simple.",
    digest: "0123456789abcdef",
  });
  expect(out.indexOf("## PURPOSE")).toBeLessThan(out.indexOf("## ARCHITECTURE"));
  expect(out.indexOf("## ARCHITECTURE")).toBeLessThan(out.indexOf("## TRADEOFFS"));
  expect(out.indexOf("## TRADEOFFS")).toBeLessThan(out.indexOf("## PHILOSOPHY"));
  expect(out).toContain("Chose X over Y because Z.");
  expect(extractDigest(out)).toBe("0123456789abcdef");
  const reparsed = parseAdrSections(out);
  expect(reparsed.PURPOSE).toBe("Do the thing.");
  expect(reparsed.TRADEOFFS).toBe("Chose X over Y because Z.");
});

test("renderAdr bootstrap: only owned sections when no structural preserved", () => {
  const out = renderAdr({
    preserved: {},
    tradeoffs: "T",
    philosophy: "P",
    digest: "00000000deadbeef",
  });
  expect(out).toContain("## TRADEOFFS");
  expect(out).toContain("## PHILOSOPHY");
  expect(out).not.toContain("## PURPOSE");
});

test("constants are as specified", () => {
  expect(CANONICAL_SECTIONS).toEqual([
    "PURPOSE",
    "STACK",
    "ARCHITECTURE",
    "PATTERNS",
    "TRADEOFFS",
    "PHILOSOPHY",
  ]);
  expect(OWNED_SECTIONS).toEqual(["TRADEOFFS", "PHILOSOPHY"]);
});
