import type { BlastRadiusEnvelope, BlastRadiusPreset } from "./envelope";
import { shouldFlagDecomposition, THRESHOLDS } from "./schema";

function backendBanner(envelope: BlastRadiusEnvelope): string {
  if (envelope.status === "error") {
    return `Blast-radius unavailable (reason: ${envelope.reason}).`;
  }
  const note = envelope.status === "degraded" && envelope.reason ? ` — ${envelope.reason}` : "";
  return `Backend: ${envelope.backend}${note}`;
}

export function renderOperatorReport(
  envelope: BlastRadiusEnvelope,
  preset: BlastRadiusPreset,
): string {
  const lines: string[] = ["## Blast-radius", "", backendBanner(envelope), ""];

  if (envelope.status === "error" || !envelope.output) {
    if (preset === "pre-execution") {
      lines.push("Unknown action risk — confirm with the operator before proceeding.");
    }
    return lines.join("\n");
  }

  const { change_scope, failure_impact, action_risk } = envelope.output;

  if (preset === "design" || preset === "completion") {
    lines.push(
      `**Change scope:** ${change_scope.fileCount} file(s), level ${change_scope.level}`,
      `- Shared infra touches: ${change_scope.sharedInfraFileCount}`,
      `- Cross-module edits: ${change_scope.crossModuleEditCount}`,
      `**Failure impact:** level ${failure_impact.level}, estimated fan-out ${failure_impact.estimatedFanOut}`,
    );
    if (failure_impact.sensitivePaths.length) {
      lines.push(`- Sensitive paths: ${failure_impact.sensitivePaths.join(", ")}`);
    }
    if (preset === "design" && shouldFlagDecomposition(change_scope)) {
      lines.push(
        "",
        "> ⚠️ Scope may warrant splitting into sub-plans — review before approving the approach.",
      );
    }
    lines.push("", `_Action risk (quiet): ${action_risk.level}_`);
  }

  if (preset === "pre-execution") {
    lines.push(
      `**Action risk:** ${action_risk.level}`,
      action_risk.tags.length ? `- Tags: ${action_risk.tags.join(", ")}` : "- Tags: (none)",
    );
    if (action_risk.rationale.length) {
      lines.push(...action_risk.rationale.map((r) => `- ${r}`));
    }
    const surface =
      action_risk.level === "high" ||
      (action_risk.level === "medium" && THRESHOLDS.actionRisk.surfaceAt === "medium");
    if (surface) {
      lines.push("", "**Operator confirmation required before this step.**");
    }
    lines.push(
      "",
      `_Scope: ${change_scope.fileCount} file(s), ${change_scope.level}; impact: ${failure_impact.level}_`,
    );
  }

  return lines.join("\n");
}
