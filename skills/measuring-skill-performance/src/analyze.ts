import * as fs from "node:fs";
import type { AnalyzerEnvelope } from "./types";
import { ClaudeCodeTranscriptReader, type TranscriptSource } from "./transcript-reader";
import { segmentSkillWindows } from "./segmenter";
import { aggregateCandidates } from "./aggregator";
import { rankCandidates, defaultTriageScore, type TriageScoreFn } from "./ranker";
import { writeCanonical } from "./exporters/json-exporter";

export interface AnalyzeOptions {
  transcriptPaths: string[];
  gitRoot?: string;
  emit?: boolean;
  reader?: TranscriptSource;
  score?: TriageScoreFn;
}

export function analyze(opts: AnalyzeOptions): AnalyzerEnvelope {
  const reader = opts.reader ?? new ClaudeCodeTranscriptReader();
  const score = opts.score ?? defaultTriageScore;

  const windows = [];
  let dropped = 0;
  for (const p of opts.transcriptPaths) {
    try {
      windows.push(...segmentSkillWindows(reader.read(p)));
    } catch {
      dropped += 1;
    }
  }

  if (windows.length === 0) {
    return {
      status: "degraded",
      source: "claude-code",
      windowCount: 0,
      droppedWindowCount: dropped,
      transport: "json-only",
      reason: "no-skill-invocations",
      candidates: [],
    };
  }

  const candidates = rankCandidates(aggregateCandidates(windows), score);
  const envelope: AnalyzerEnvelope = {
    status: "success",
    source: "claude-code",
    windowCount: windows.length,
    droppedWindowCount: dropped,
    transport: "json-only",
    reason: null,
    candidates,
  };

  if (opts.emit !== false) writeCanonical(opts.gitRoot ?? process.cwd(), envelope);
  return envelope;
}

// CLI:  node skill-metrics.cjs analyze  < { "transcriptPaths": [...], "gitRoot": "..." }
if (require.main === module) {
  const cmd = process.argv[2];
  const raw = fs.readFileSync(0, "utf8");
  if (cmd === "analyze") {
    const input = JSON.parse(raw || "{}") as AnalyzeOptions;
    process.stdout.write(JSON.stringify(analyze({ ...input, emit: input.emit ?? true }), null, 2) + "\n");
  } else {
    process.stderr.write("usage: node skill-metrics.cjs analyze\n");
    process.exit(1);
  }
}
