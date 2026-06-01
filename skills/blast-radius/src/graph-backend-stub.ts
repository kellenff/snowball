import type { BlastRadiusOutput, ReasonCode } from "./envelope";

export interface GraphAttempt {
  ok: boolean;
  output?: BlastRadiusOutput;
  reason?: ReasonCode;
}

/** Plan 1 stub — always unavailable. Plan 3 implements real MCP queries. */
export function tryGraphBackend(_input: { gitRoot: string; paths: string[] }): GraphAttempt {
  return { ok: false, reason: "graph-unavailable" };
}
