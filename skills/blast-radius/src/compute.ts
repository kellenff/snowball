import type { BlastRadiusEnvelope, ComputeInput, ReasonCode } from "./envelope";
import { assertEnvelope } from "./envelope";
import { tryGraphBackend } from "./graph-backend";
import { computeHeuristic } from "./heuristic-backend";
import { listChangedFiles, mergePathLists } from "./git-diff";
import { renderOperatorReport } from "./render";
import { writeLastEnvelope } from "./write-envelope";

function errorEnvelope(reason: ReasonCode): BlastRadiusEnvelope {
  return { status: "error", backend: "none", output: null, reason };
}

export function computeBlastRadius(input: ComputeInput): BlastRadiusEnvelope {
  if (input.explicitSkip) {
    return {
      status: "degraded",
      backend: "none",
      output: null,
      reason: "explicit-skip",
    };
  }

  const gitPaths = input.changeSet.gitRef
    ? listChangedFiles(input.gitRoot, input.changeSet.gitRef)
    : listChangedFiles(input.gitRoot, "HEAD");
  const paths = mergePathLists(input.changeSet.paths, gitPaths);

  if (paths.length === 0 && !input.changeSet.proposedAction?.trim()) {
    const env = errorEnvelope("change-untracked");
    assertEnvelope(env);
    return env;
  }

  const graph = tryGraphBackend({
    gitRoot: input.gitRoot,
    paths,
    proposedAction: input.changeSet.proposedAction,
  });
  const attempts = graph.backend_attempts ?? [];
  if (graph.ok && graph.output) {
    const env: BlastRadiusEnvelope = {
      status: "success",
      backend: "graph",
      output: graph.output,
      reason: null,
      backend_attempts: attempts,
    };
    assertEnvelope(env);
    return env;
  }

  try {
    const output = computeHeuristic({
      paths,
      proposedAction: input.changeSet.proposedAction,
    });
    const env: BlastRadiusEnvelope = {
      status: graph.reason ? "degraded" : "success",
      backend: "heuristic",
      output,
      reason: graph.reason ?? null,
      backend_attempts: attempts,
    };
    assertEnvelope(env);
    return env;
  } catch {
    const env = errorEnvelope("compute-error");
    assertEnvelope(env);
    return env;
  }
}

export function computeAndPersist(input: ComputeInput): {
  envelope: BlastRadiusEnvelope;
  scratchPath: string;
} {
  const envelope = computeBlastRadius(input);
  const scratchPath = writeLastEnvelope(input.gitRoot, envelope);
  return { envelope, scratchPath };
}

// CLI (single bundle entry — render lives here too):
//   node compute.cjs compute              < ComputeInput JSON
//   node compute.cjs compute-and-persist  < ComputeInput JSON
//   node compute.cjs render               < { envelope, preset } JSON
if (require.main === module) {
  const cmd = process.argv[2];
  const raw = require("node:fs").readFileSync(0, "utf8");

  if (cmd === "compute") {
    const input = JSON.parse(raw || "{}") as ComputeInput;
    process.stdout.write(JSON.stringify(computeBlastRadius(input), null, 2) + "\n");
  } else if (cmd === "compute-and-persist") {
    const input = JSON.parse(raw || "{}") as ComputeInput;
    process.stdout.write(JSON.stringify(computeAndPersist(input), null, 2) + "\n");
  } else if (cmd === "render") {
    const { envelope, preset } = JSON.parse(raw || "{}") as {
      envelope: import("./envelope").BlastRadiusEnvelope;
      preset: import("./envelope").BlastRadiusPreset;
    };
    process.stdout.write(renderOperatorReport(envelope, preset) + "\n");
  } else {
    process.stderr.write("usage: node compute.cjs <compute|compute-and-persist|render>\n");
    process.exit(1);
  }
}
