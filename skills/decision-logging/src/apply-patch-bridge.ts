import { appendObservation, type Observation } from "./append-observation";

export interface ApplyPatchObservationInput {
  toolInput: unknown;
  sessionId: string;
  sourceEventId: string;
  gitRoot: string;
}

function extractPatch(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const obj = input as Record<string, unknown>;
  const patch = obj.patch ?? obj.diff ?? "";
  return typeof patch === "string" ? patch : "";
}

function extractTouchedPaths(patch: string): string[] {
  const paths = new Set<string>();
  // Match `diff --git a/<path> b/<path>` (works for create/modify/delete).
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  for (const m of patch.matchAll(re)) {
    paths.add(m[1]);
  }
  return [...paths].sort();
}

export function handleApplyPatchObservation(
  input: ApplyPatchObservationInput,
): boolean {
  const patch = extractPatch(input.toolInput);
  if (!patch.trim()) return false;

  const touched = extractTouchedPaths(patch);
  const obs: Observation = {
    schema_version: "1.1",
    timestamp: new Date().toISOString(),
    session_id: input.sessionId,
    type: "observation",
    confidence: "high",
    source: "agent",
    content: `apply_patch edited ${touched.length} file(s): ${touched.join(", ") || "(unknown paths)"}`,
    rationale:
      "Captured by VTCode PostToolUse hook on apply_patch (B1.1 in v6.7.0 catalog).",
    related_files: touched,
    related_decision: null,
    tags: ["ambient", "vtcode", "apply_patch"],
  };
  appendObservation(obs, { gitRoot: input.gitRoot });
  return true;
}

// CLI entry: read JSON from stdin and call the handler.
if (
  import.meta.main ||
  (typeof require !== "undefined" && require.main === module)
) {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    try {
      const payload = JSON.parse(raw) as {
        tool_input?: unknown;
        session_id?: string;
        tool_use_id?: string;
      };
      handleApplyPatchObservation({
        toolInput: payload.tool_input,
        sessionId: payload.session_id ?? "unknown",
        sourceEventId: payload.tool_use_id ?? "unknown",
        gitRoot: process.env.GIT_ROOT ?? process.cwd(),
      });
    } catch {
      // best-effort: swallow and exit 0
    }
    process.exit(0);
  });
}
