import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { computeBlastRadius } from "../../skills/blast-radius/src/compute";
import {
  createDefaultYacttGraphClient,
  isRepoIndexed,
  projectUriFromRoot,
} from "../../skills/blast-radius/src/yactt-http-client";

const LIVE = process.env.BLAST_RADIUS_LIVE_GRAPH === "1";

function gitRoot(): string {
  return execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
}

describe("graph backend live contract", () => {
  test.skipIf(!LIVE)(
    "indexed snowball repo returns graph backend success",
    async () => {
      const root = gitRoot();
      const client = createDefaultYacttGraphClient();
      expect(await client.isAvailable()).toBe(true);

      const projects = await client.listProjects();
      expect(isRepoIndexed(projects, root)).toBe(true);

      const env = await computeBlastRadius({
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
    },
    60_000,
  );

  test.skipIf(!LIVE)(
    "fixture stub values are achievable via get_symbols_overview",
    async () => {
      const root = gitRoot();
      const client = createDefaultYacttGraphClient();
      expect(isRepoIndexed(await client.listProjects(), root)).toBe(true);

      const fixture = JSON.parse(
        fs.readFileSync(path.join(__dirname, "fixtures/mcp/symbols-overview-compute.json"), "utf8"),
      );

      const live = await client.getSymbolsOverview(
        projectUriFromRoot(root),
        "skills/blast-radius/src/compute.ts",
      );

      expect(live?.symbols?.length).toBeGreaterThanOrEqual(fixture.minSymbols);
      for (const name of fixture.expectedSymbolNames as string[]) {
        expect(live?.symbols?.some((r) => r.name === name)).toBe(true);
      }
    },
    30_000,
  );
});
