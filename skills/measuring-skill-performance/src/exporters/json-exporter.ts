import * as fs from "node:fs";
import * as path from "node:path";
import type { AnalyzerEnvelope } from "../types";

/** Writes the canonical record set under <gitRoot>/.snowball/metrics/. */
export function writeCanonical(gitRoot: string, envelope: AnalyzerEnvelope): string {
  const dir = path.join(gitRoot, ".snowball", "metrics");
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(envelope, null, 2) + "\n");

  const lines = envelope.candidates.flatMap((c) =>
    c.sample_windows.map((w) =>
      JSON.stringify({
        skill_name: c.skill_name,
        sessionId: w.sessionId,
        startedAt: w.startedAt,
        messageSpan: w.messageSpan,
        marginalTokens: w.marginalTokens,
      }),
    ),
  );
  fs.writeFileSync(path.join(dir, "windows.jsonl"), lines.join("\n") + (lines.length ? "\n" : ""));

  return dir;
}
