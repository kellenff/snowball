import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  prepare,
  renderExcerptForHook,
} from "../../skills/recalling-project-context/src/recall-context";
import { digestMarker } from "../../skills/syncing-decisions-to-memory/src/adr";
import { computeDigest } from "../../skills/syncing-decisions-to-memory/src/digest";
import { gatherDecisions } from "../../skills/syncing-decisions-to-memory/src/gather";
import { filterRecords } from "../../skills/syncing-decisions-to-memory/src/filter";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("prepare returns empty when no ADR and no MADRs", () => {
  const repo = makeTempRepo();
  try {
    const out = prepare({ gitRoot: repo });
    expect(out.source).toBe("empty");
    expect(out.madrs).toEqual([]);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reads ADR file and scoped MADRs", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-05-30T2035-a.md",
      madrFixture({ title: "Scoped", status: "accepted", body: "skills/decision-logging detail" }),
    );
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      "## TRADEOFFS\n\nPrefer passive hooks.\n\n## PHILOSOPHY\n\nCapture is a side effect.\n",
    );

    const out = prepare({ gitRoot: repo, scope: "decision-logging" });
    expect(out.source).toBe("adr-file");
    expect(out.sections.TRADEOFFS).toContain("passive hooks");
    expect(out.madrs.length).toBe(1);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("renderExcerptForHook emits project-memory block", () => {
  const repo = makeTempRepo();
  try {
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(path.join(adrDir, "adr.md"), "## PHILOSOPHY\n\nSide-effect capture only.\n");
    const text = renderExcerptForHook({ gitRoot: repo });
    expect(text).toContain("<project-memory>");
    expect(text).toContain("Side-effect capture only.");
    expect(text).toContain("</project-memory>");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reports staleness current when ADR digest matches decisions", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1200-a.md",
      madrFixture({ title: "Recall loop", status: "accepted", body: "Cycle-start recall." }),
    );
    const filtered = filterRecords(gatherDecisions(repo));
    const digest = computeDigest(filtered);
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nPassive capture.\n\n${digestMarker(digest)}`,
    );

    const out = prepare({ gitRoot: repo });
    expect(out.staleness).toBe("current");
    expect(out.adrDigest).toBe(digest);
    expect(out.currentDigest).toBe(digest);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reports staleness stale when decisions changed after sync", () => {
  const repo = makeTempRepo();
  try {
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nOld rationale.\n\n${digestMarker("deadbeefdeadbeef")}`,
    );
    writeDecisionFile(
      repo,
      "2026-06-07T1201-b.md",
      madrFixture({ title: "New decision", status: "accepted", body: "After sync." }),
    );

    const out = prepare({ gitRoot: repo });
    expect(out.staleness).toBe("stale");
    expect(out.adrDigest).toBe("deadbeefdeadbeef");
    expect(out.currentDigest).not.toBe("deadbeefdeadbeef");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("prepare reports staleness unknown for madrs-only source", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1202-c.md",
      madrFixture({ title: "No ADR yet", status: "accepted" }),
    );
    const out = prepare({ gitRoot: repo });
    expect(out.source).toBe("madrs-only");
    expect(out.staleness).toBe("unknown");
    expect(out.adrDigest).toBeNull();
  } finally {
    cleanupTempRepo(repo);
  }
});

test("renderExcerptForHook surfaces stale ADR warning", () => {
  const repo = makeTempRepo();
  try {
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nStale.\n\n${digestMarker("deadbeefdeadbeef")}`,
    );
    writeDecisionFile(
      repo,
      "2026-06-07T1300-d.md",
      madrFixture({ title: "Newer", status: "accepted" }),
    );
    const text = renderExcerptForHook({ gitRoot: repo });
    expect(text).toContain("ADR may be stale");
    expect(text).toContain("syncing-decisions-to-memory");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("renderExcerptForHook surfaces current ADR line", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-06-07T1301-e.md",
      madrFixture({ title: "Synced", status: "accepted", body: "In sync." }),
    );
    const filtered = filterRecords(gatherDecisions(repo));
    const digest = computeDigest(filtered);
    const adrDir = path.join(repo, ".codebase-memory");
    fs.mkdirSync(adrDir, { recursive: true });
    fs.writeFileSync(
      path.join(adrDir, "adr.md"),
      `## PHILOSOPHY\n\nCurrent.\n\n${digestMarker(digest)}`,
    );
    const text = renderExcerptForHook({ gitRoot: repo });
    expect(text).toContain("ADR is current");
    expect(text).toContain(digest);
  } finally {
    cleanupTempRepo(repo);
  }
});
