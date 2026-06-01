import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { computeBlastRadius } from "../../skills/blast-radius/src/compute";
import {
  createDefaultCodebaseMemoryClient,
  resolveProjectName,
} from "../../skills/blast-radius/src/mcp-cli";

const LIVE = process.env.BLAST_RADIUS_LIVE_GRAPH === "1";

function gitRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

describe("graph backend live contract", () => {
  test.skipIf(!LIVE)("indexed snowball repo returns graph backend success", () => {
    const root = gitRoot();
    const client = createDefaultCodebaseMemoryClient();
    expect(client.isAvailable()).toBe(true);

    const project = resolveProjectName(client.listProjects(), root);
    expect(project).not.toBeNull();

    const env = computeBlastRadius({
      gitRoot: root,
      preset: "design",
      changeSet: {
        paths: ["skills/blast-radius/src/compute.ts"],
      },
    });

    expect(env.status).toBe("success");
    expect(env.backend).toBe("graph");
    expect(env.reason).toBeNull();
    expect(env.output?.failure_impact.estimatedFanOut).toBeGreaterThan(0);
  });

  test.skipIf(!LIVE)("fixture stub values are achievable via search_graph", () => {
    const root = gitRoot();
    const client = createDefaultCodebaseMemoryClient();
    const project = resolveProjectName(client.listProjects(), root);
    expect(project).not.toBeNull();

    const fixture = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/mcp/search-graph-core.json"), "utf8"),
    );

    const live = client.searchGraph(project!, {
      file_pattern: "skills/blast-radius/src/compute.ts",
      label: "Function",
      limit: 10,
    });

    expect(live?.results?.length).toBeGreaterThanOrEqual(fixture.minResults);
    for (const name of fixture.expectedFunctionNames as string[]) {
      expect(live?.results?.some((r) => r.name === name)).toBe(true);
    }
  });
});
