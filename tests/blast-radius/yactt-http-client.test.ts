import { afterEach, describe, expect, test } from "bun:test";
import {
  createDefaultYacttGraphClient,
  isRepoIndexed,
  projectUriFromRoot,
} from "../../skills/blast-radius/src/yactt-http-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BLAST_RADIUS_DISABLE_GRAPH;
  delete process.env.YACTT_MCP_URL;
});

describe("yactt-http-client helpers", () => {
  test("projectUriFromRoot returns file URI", () => {
    expect(projectUriFromRoot("/tmp/foo")).toBe("file:///tmp/foo");
  });

  test("isRepoIndexed matches resolved paths", () => {
    expect(isRepoIndexed([{ name: "x", path: "/tmp/foo" }], "/tmp/foo")).toBe(true);
    expect(isRepoIndexed([{ name: "x", path: "/tmp/other" }], "/tmp/foo")).toBe(false);
  });
});

describe("createDefaultYacttGraphClient", () => {
  test("BLAST_RADIUS_DISABLE_GRAPH skips availability", async () => {
    process.env.BLAST_RADIUS_DISABLE_GRAPH = "1";
    const client = createDefaultYacttGraphClient();
    expect(await client.isAvailable()).toBe(false);
  });

  test("isAvailable probes /healthz", async () => {
    process.env.YACTT_MCP_URL = "http://127.0.0.1:59999/mcp";
    const urls: string[] = [];
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ status: "ok" }), { status: 200 });
    }) as typeof fetch;

    const client = createDefaultYacttGraphClient();
    expect(await client.isAvailable()).toBe(true);
    expect(urls[0]).toContain("/healthz");
  });

  test("tools/call parses structuredContent after session init", async () => {
    process.env.YACTT_MCP_URL = "http://127.0.0.1:59999/mcp";
    let call = 0;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
      call += 1;
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (body.method === "initialize") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: { protocolVersion: "2025-03-26", capabilities: {} },
          }),
          {
            status: 200,
            headers: { "Mcp-Session-Id": "sess-1", "Content-Type": "application/json" },
          },
        );
      }
      if (body.method === "notifications/initialized") {
        return new Response(null, { status: 204 });
      }
      if (body.method === "tools/call" && body.params?.name === "list_projects") {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: body.id,
            result: {
              structuredContent: {
                projects: [{ name: "demo", path: "/tmp/demo" }],
                count: 1,
                registry: "/tmp/reg.json",
              },
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("unexpected", { status: 500 });
    }) as typeof fetch;

    const client = createDefaultYacttGraphClient();
    const projects = await client.listProjects();
    expect(projects).toEqual([{ name: "demo", path: "/tmp/demo" }]);
    expect(call).toBeGreaterThanOrEqual(3);
  });
});
