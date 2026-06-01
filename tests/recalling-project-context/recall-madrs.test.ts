import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  madrMatchesScope,
  recallMadrs,
} from "../../skills/recalling-project-context/src/recall-madrs";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("madrMatchesScope matches filename, title, body, and tags", () => {
  const raw = madrFixture({
    title: "Hook storage layout",
    status: "accepted",
    body: "Use hooks/ for registration.",
    tags: ["decision-logging"],
  });
  const record = {
    filename: "2026-05-30-hooks-layout.md",
    title: "Hook storage layout",
    status: "accepted",
    sourceEventId: "evt-1",
    body: "Use hooks/ for registration.",
  };
  expect(madrMatchesScope(record, raw, "hooks/")).toBe(true);
  expect(madrMatchesScope(record, raw, "decision-logging")).toBe(true);
  expect(madrMatchesScope(record, raw, "billing")).toBe(false);
});

test("recallMadrs returns newest scoped MADRs first", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-05-30T2035-a.md",
      madrFixture({ title: "Alpha hooks", status: "accepted", body: "hooks/ alpha" }),
    );
    writeDecisionFile(
      repo,
      "2026-05-30T2036-b.md",
      madrFixture({ title: "Beta billing", status: "accepted", body: "billing beta" }),
    );
    const dir = path.join(repo, "docs", "snowball", "decisions");
    const aPath = path.join(dir, "2026-05-30T2035-a.md");
    const bPath = path.join(dir, "2026-05-30T2036-b.md");
    const now = Date.now();
    fs.utimesSync(aPath, now / 1000, (now - 1000) / 1000);
    fs.utimesSync(bPath, now / 1000, now / 1000);

    const scoped = recallMadrs({ gitRoot: repo, scope: "hooks", maxMadrs: 5 });
    expect(scoped.madrs.length).toBe(1);
    expect(scoped.madrs[0].title).toBe("Alpha hooks");

    const all = recallMadrs({ gitRoot: repo, maxMadrs: 5 });
    expect(all.madrs.length).toBe(2);
    expect(all.madrs[0].title).toBe("Beta billing");
  } finally {
    cleanupTempRepo(repo);
  }
});
