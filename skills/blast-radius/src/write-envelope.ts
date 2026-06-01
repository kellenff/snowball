import * as fs from "node:fs";
import * as path from "node:path";
import type { BlastRadiusEnvelope } from "./envelope";

export function envelopeScratchPath(gitRoot: string): string {
  return path.join(gitRoot, ".snowball", "blast-radius", "last.json");
}

export function writeLastEnvelope(gitRoot: string, envelope: BlastRadiusEnvelope): string {
  const target = envelopeScratchPath(gitRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(envelope, null, 2) + "\n", "utf8");
  return target;
}
