export type Staleness = "current" | "stale" | "unknown";

export function computeStaleness(adrDigest: string | null, currentDigest: string): Staleness {
  if (!adrDigest) return "unknown";
  return adrDigest === currentDigest ? "current" : "stale";
}
