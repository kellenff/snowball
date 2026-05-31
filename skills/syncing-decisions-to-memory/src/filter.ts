import type { GatherResult, MadrRecord, ObservationRecord } from "./gather";

export const KEEP_MADR_STATUSES = new Set(["accepted", "proposed"]);
export const KEEP_OBS_TYPES = new Set(["constraint", "implementation-choice"]);

export interface FilteredInput {
  madrs: MadrRecord[];
  observations: ObservationRecord[];
}

export function filterRecords(input: GatherResult): FilteredInput {
  return {
    madrs: input.madrs.filter((m) => KEEP_MADR_STATUSES.has(m.status)),
    observations: input.observations.filter(
      (o) => o.confidence === "high" || KEEP_OBS_TYPES.has(o.type),
    ),
  };
}
