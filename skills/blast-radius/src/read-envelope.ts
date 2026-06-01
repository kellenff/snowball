import * as fs from "node:fs";
import { assertEnvelope, type BlastRadiusEnvelope } from "./envelope";
import { envelopeScratchPath } from "./write-envelope";

export function readLastEnvelope(gitRoot: string): BlastRadiusEnvelope | null {
  const target = envelopeScratchPath(gitRoot);
  if (!fs.existsSync(target)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf8")) as BlastRadiusEnvelope;
    assertEnvelope(parsed);
    return parsed;
  } catch {
    return null;
  }
}
