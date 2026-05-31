import { test, expect } from "bun:test";
import { prepare } from "../../skills/syncing-decisions-to-memory/src/sync-decisions";
import { renderAdr, digestMarker } from "../../skills/syncing-decisions-to-memory/src/adr";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

function repoWithOneDecision(): string {
  const repo = makeTempRepo();
  writeDecisionFile(
    repo,
    "2026-05-30T2035-a.md",
    madrFixture({
      title: "Pick A",
      status: "accepted",
      sourceEventId: "evt-1",
      body: "Chose A over B.",
    }),
  );
  return repo;
}

test("prepare returns synthesize with a brief when ADR is empty and decisions exist", () => {
  const repo = repoWithOneDecision();
  try {
    const out = prepare({ gitRoot: repo, adrContent: "" });
    expect(out.action).toBe("synthesize");
    expect(out.reason).toBe("stale");
    expect(out.brief.madrs.length).toBe(1);
    expect(out.brief.madrs[0].title).toBe("Pick A");
    expect(out.digest).toMatch(/^[0-9a-f]{16}$/);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare returns noop/already-current when the stored digest matches", () => {
  const repo = repoWithOneDecision();
  try {
    const first = prepare({ gitRoot: repo, adrContent: "" });
    const adr = renderAdr({ preserved: {}, tradeoffs: "x", philosophy: "y", digest: first.digest });
    const second = prepare({ gitRoot: repo, adrContent: adr });
    expect(second.action).toBe("noop");
    expect(second.reason).toBe("already-current");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare returns noop/nothing-to-sync when no qualifying decisions", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-05-30T2035-s.md",
      madrFixture({ title: "Old", status: "superseded" }),
    );
    const out = prepare({ gitRoot: repo, adrContent: "" });
    expect(out.action).toBe("noop");
    expect(out.reason).toBe("nothing-to-sync");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare preserves structural sections and excludes owned ones from preserved", () => {
  const repo = repoWithOneDecision();
  try {
    const adr = [
      "## PURPOSE",
      "",
      "Existing purpose.",
      "",
      "## TRADEOFFS",
      "",
      `Old machine prose. ${digestMarker("ffffffffffffffff")}`,
      "",
    ].join("\n");
    const out = prepare({ gitRoot: repo, adrContent: adr });
    expect(out.preserved.PURPOSE).toBe("Existing purpose.");
    expect(out.preserved.TRADEOFFS).toBeUndefined(); // owned, not preserved
  } finally {
    cleanupTempRepo(repo);
  }
});
