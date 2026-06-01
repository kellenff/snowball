import { describe, expect, test } from "bun:test";
import { tryGraphBackend } from "../../skills/blast-radius/src/graph-backend";
import type { CodebaseMemoryClient } from "../../skills/blast-radius/src/mcp-cli";

function mockClient(overrides: Partial<CodebaseMemoryClient>): CodebaseMemoryClient {
  return {
    isAvailable: () => true,
    listProjects: () => [
      {
        name: "fixture-project",
        root_path: "/tmp/blast-radius-graph-fixture",
      },
    ],
    detectChanges: () => ({
      changed_files: ["src/core.ts"],
      changed_count: 1,
      impacted_symbols: [
        { name: "handleRequest", label: "Function", file: "src/core.ts" },
        { name: "validateInput", label: "Function", file: "src/core.ts" },
      ],
      depth: 2,
    }),
    searchGraph: (_project, opts) => {
      if (opts.file_pattern === "src/core.ts") {
        return {
          total: 2,
          results: [
            {
              name: "handleRequest",
              qualified_name: "fixture.handleRequest",
              in_degree: 4,
              file_path: "src/core.ts",
            },
            {
              name: "validateInput",
              qualified_name: "fixture.validateInput",
              in_degree: 1,
              file_path: "src/core.ts",
            },
          ],
        };
      }
      return { total: 0, results: [] };
    },
    ...overrides,
  };
}

describe("tryGraphBackend (stubbed MCP client)", () => {
  test("returns graph success with structural fan-out", () => {
    const attempt = tryGraphBackend(
      {
        gitRoot: "/tmp/blast-radius-graph-fixture",
        paths: ["src/core.ts"],
      },
      mockClient({}),
    );
    expect(attempt.ok).toBe(true);
    expect(attempt.output?.failure_impact.estimatedFanOut).toBeGreaterThan(0);
    expect(attempt.output?.change_scope.fileCount).toBe(1);
  });

  test("returns repo-not-indexed when project missing", () => {
    const attempt = tryGraphBackend(
      { gitRoot: "/unindexed/repo", paths: ["a.ts"] },
      mockClient({ listProjects: () => [] }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("repo-not-indexed");
  });

  test("returns graph-unavailable when CLI absent", () => {
    const attempt = tryGraphBackend(
      { gitRoot: "/tmp/blast-radius-graph-fixture", paths: ["a.ts"] },
      mockClient({ isAvailable: () => false }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("graph-unavailable");
  });

  test("returns mcp-timeout when detect_changes fails", () => {
    const attempt = tryGraphBackend(
      { gitRoot: "/tmp/blast-radius-graph-fixture", paths: ["src/core.ts"] },
      mockClient({ detectChanges: () => null }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("mcp-timeout");
  });
});
