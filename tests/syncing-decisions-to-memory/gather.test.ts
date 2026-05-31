import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  gatherDecisions,
  parseMadr,
  parseObservationLine,
} from "../../skills/syncing-decisions-to-memory/src/gather";
import { makeTempRepo, cleanupTempRepo, writeDecisionFile, madrFixture } from "./test-helpers";

test("parseMadr extracts status, title, source_event_id, and body", () => {
  const raw = madrFixture({
    title: "Pick A",
    status: "accepted",
    sourceEventId: "evt-9",
    body: "Chose A over B.",
  });
  const r = parseMadr("f.md", raw);
  expect("warning" in r).toBe(false);
  if ("warning" in r) return;
  expect(r.status).toBe("accepted");
  expect(r.title).toBe("Pick A");
  expect(r.sourceEventId).toBe("evt-9");
  expect(r.body).toContain("Chose A over B.");
});

test("parseMadr warns on missing frontmatter", () => {
  const r = parseMadr("bad.md", "# No frontmatter here\n");
  expect("warning" in r).toBe(true);
});

test("parseObservationLine keeps required string fields and skips blank lines", () => {
  expect(parseObservationLine("")).toBeNull();
  const good = JSON.stringify({
    schema_version: "1.0",
    timestamp: "2026-05-27T03:55:46Z",
    session_id: "s1",
    type: "constraint",
    confidence: "high",
    source: "subagent",
    content: "bare=true breaks worktree git",
    rationale: "...",
    related_files: [],
    related_decision: null,
    tags: ["systematic-debugging"],
  });
  const r = parseObservationLine(good);
  expect("warning" in r!).toBe(false);
});

test("parseObservationLine warns on unparseable JSON", () => {
  const r = parseObservationLine("{not json");
  expect(r && "warning" in r).toBe(true);
});

test("gatherDecisions reads md files and observations.jsonl, collecting warnings", () => {
  const repo = makeTempRepo();
  try {
    writeDecisionFile(
      repo,
      "2026-05-30T2035-a.md",
      madrFixture({ title: "A", status: "accepted" }),
    );
    writeDecisionFile(repo, "2026-05-30T2036-b.md", "broken file no frontmatter");
    const dir = path.join(repo, "docs", "snowball", "decisions");
    fs.writeFileSync(
      path.join(dir, "observations.jsonl"),
      JSON.stringify({
        schema_version: "1.0",
        timestamp: "2026-05-27T03:55:46Z",
        session_id: "s1",
        type: "constraint",
        confidence: "high",
        source: "subagent",
        content: "c",
        rationale: "r",
        related_files: [],
        related_decision: null,
        tags: ["x"],
      }) + "\n{bad line\n",
    );
    const out = gatherDecisions(repo);
    expect(out.madrs.length).toBe(1);
    expect(out.observations.length).toBe(1);
    expect(out.warnings.length).toBe(2); // broken md + bad jsonl line
  } finally {
    cleanupTempRepo(repo);
  }
});

test("gatherDecisions returns empty result when decisions dir is absent", () => {
  const repo = makeTempRepo();
  try {
    const out = gatherDecisions(repo);
    expect(out.madrs).toEqual([]);
    expect(out.observations).toEqual([]);
    expect(out.warnings).toEqual([]);
  } finally {
    cleanupTempRepo(repo);
  }
});
