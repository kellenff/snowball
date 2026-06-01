import type { CandidateRecord } from "./types";

export type TriageScoreFn = (candidate: CandidateRecord) => number;

/** OPERATOR-OWNED POLICY. Default per spec: volume × marginal p50 × (1 + error rate). */
export const defaultTriageScore: TriageScoreFn = (c) =>
  c.invocation_count * c.tokens.marginal.p50 * (1 + c.reliability.tool_error_rate);

export function rankCandidates(
  candidates: CandidateRecord[],
  score: TriageScoreFn,
): CandidateRecord[] {
  return candidates
    .map((c) => ({ ...c, triage_score: score(c) }))
    .sort((a, b) => b.triage_score - a.triage_score);
}
