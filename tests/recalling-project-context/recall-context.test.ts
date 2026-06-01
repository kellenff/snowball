import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  prepare,
  renderExcerptForHook,
} from "../../skills/recalling-project-context/src/recall-context";
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
