export {
  makeTempRepo,
  cleanupTempRepo,
  writeDecisionFile,
} from "../syncing-decisions-to-memory/test-helpers";

/** Build a minimal MADR markdown string with optional tags for recall tests. */
export function madrFixture(opts: {
  title: string;
  status: string;
  sourceEventId?: string;
  body?: string;
  tags?: string[];
}): string {
  const tags = opts.tags ?? ["ambient"];
  const tagLines = tags.map((t) => `    - ${t}`).join("\n");
  const fm = [
    "---",
    `title: ${opts.title}`,
    `status: ${opts.status}`,
    "date: '2026-05-30T20:35:25.481Z'",
    "deciders:",
    "  - kellen",
    "snowball:",
    "  schema_version: '1.0'",
    "  source: operator",
    "  confidence: high",
    "  capture_mechanism: ask-user-question",
    "  session_id: sess-1",
    `  source_event_id: ${opts.sourceEventId ?? "evt-1"}`,
    "  supersedes: null",
    "  tags:",
    tagLines,
    "---",
    "",
    `# ${opts.title}`,
    "",
    "## Decision Outcome",
    "",
    opts.body ?? "Chose the thing.",
    "",
  ];
  return fm.join("\n");
}
