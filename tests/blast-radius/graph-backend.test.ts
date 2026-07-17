import { describe, expect, test } from "bun:test";
import { tryGraphBackend } from "../../skills/blast-radius/src/graph-backend";
import type { YacttGraphClient } from "../../skills/blast-radius/src/yactt-http-client";

function mockClient(overrides: Partial<YacttGraphClient>): YacttGraphClient {
  return {
    isAvailable: async () => true,
    listProjects: async () => [
      {
        name: "fixture-project",
        path: "/tmp/blast-radius-graph-fixture",
      },
    ],
    detectChanges: async () => ({
      changes: [
        {
          file: "src/core.ts",
          symbol: { id: "fn:handleRequest", name: "handleRequest", kind: "FUNCTION" },
          callers: [{ targetId: "fn:callerA" }, { targetId: "fn:callerB" }],
        },
      ],
    }),
    getSymbolsOverview: async (_uri, file) => {
      if (file === "src/core.ts") {
        return {
          file,
          symbols: [
            {
              id: "fn:handleRequest",
              kind: "FUNCTION",
              name: "handleRequest",
              summary: "handles requests",
            },
            {
              id: "fn:validateInput",
              kind: "FUNCTION",
              name: "validateInput",
              summary: "validates input",
            },
          ],
        };
      }
      return { file, symbols: [] };
    },
    findReferencingSymbols: async (_uri, symbol) => {
      if (symbol === "fn:handleRequest") {
        return {
          references: [
            { edgeKind: "callers", targetId: "fn:callerA" },
            { edgeKind: "callers", targetId: "fn:callerB" },
            { edgeKind: "callers", targetId: "fn:callerC" },
            { edgeKind: "callers", targetId: "fn:callerD" },
          ],
        };
      }
      if (symbol === "fn:validateInput") {
        return {
          references: [{ edgeKind: "callers", targetId: "fn:handleRequest" }],
        };
      }
      return { references: [] };
    },
    ...overrides,
  };
}

describe("tryGraphBackend (stubbed yactt client)", () => {
  test("returns graph success with structural fan-out (path-only)", async () => {
    const attempt = await tryGraphBackend(
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

  test("returns graph success with gitRef detect_changes", async () => {
    const attempt = await tryGraphBackend(
      {
        gitRoot: "/tmp/blast-radius-graph-fixture",
        paths: ["src/core.ts"],
        gitRef: "main",
      },
      mockClient({}),
    );
    expect(attempt.ok).toBe(true);
    expect(attempt.output?.failure_impact.estimatedFanOut).toBeGreaterThan(0);
  });

  test("returns repo-not-indexed when project missing", async () => {
    const attempt = await tryGraphBackend(
      { gitRoot: "/unindexed/repo", paths: ["a.ts"] },
      mockClient({ listProjects: async () => [] }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("repo-not-indexed");
  });

  test("returns graph-unavailable when MCP unreachable", async () => {
    const attempt = await tryGraphBackend(
      { gitRoot: "/tmp/blast-radius-graph-fixture", paths: ["a.ts"] },
      mockClient({ isAvailable: async () => false }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("graph-unavailable");
  });

  test("returns mcp-timeout when detect_changes fails with gitRef", async () => {
    const attempt = await tryGraphBackend(
      {
        gitRoot: "/tmp/blast-radius-graph-fixture",
        paths: ["src/core.ts"],
        gitRef: "main",
      },
      mockClient({ detectChanges: async () => null }),
    );
    expect(attempt.ok).toBe(false);
    expect(attempt.reason).toBe("mcp-timeout");
  });
});
