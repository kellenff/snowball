import { createHash } from "node:crypto";
import type { FilteredInput } from "./filter";

function sha256(s: string): string {
  return createHash("sha256").update(s, "utf8").digest("hex");
}

export function computeDigest(input: FilteredInput): string {
  const lines: string[] = [];
  for (const m of input.madrs) {
    lines.push(`madr:${m.sourceEventId}:${sha256(m.body)}`);
  }
  for (const o of input.observations) {
    lines.push(`obs:${o.sessionId}|${o.timestamp}:${sha256(o.content)}`);
  }
  lines.sort();
  return sha256(lines.join("\n")).slice(0, 16);
}
