// tests/blast-radius/yactt-cli/stub-server.ts
// Test fixture: a frozen MCP server that returns a known shape regardless of input.
// Used by cli.test.ts so the shim can be exercised without depending on the real
// yactt binary.

interface Repo {
  name: string;
  root_path: string;
}
interface Symbol {
  name: string;
  qualified_name: string;
  in_degree: number;
  file: string;
}

const FIXTURE_REPOS: Repo[] = [
  { name: "stub-repo-1", root_path: "/tmp/snowball-stub-1" },
  { name: "stub-repo-2", root_path: "/tmp/snowball-stub-2" },
  { name: "stub-repo-3", root_path: "/tmp/snowball-stub-3" },
];

const FIXTURE_SYMBOLS: Symbol[] = Array.from({ length: 12 }).map((_, i) => ({
  name: `func_${i}`,
  qualified_name: `stub.func_${i}`,
  in_degree: i % 5,
  file: `pkg_${i % 4}/file_${i}.ts`,
}));

function jsonRpcResult(id: number | null, result: unknown) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`;
}

function handle(line: string): string | null {
  let msg: { id?: number; method: string; params?: unknown };
  try {
    msg = JSON.parse(line);
  } catch {
    return null;
  }

  if (msg.method === "initialize")
    return jsonRpcResult(msg.id ?? null, {
      protocolVersion: "2024-11-05",
      serverInfo: { name: "stub", version: "0.0.0" },
      capabilities: { tools: {} },
    });
  if (msg.method === "tools/list")
    return jsonRpcResult(msg.id ?? null, {
      tools: [
        {
          name: "list_loaded_repos",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
        {
          name: "search_symbols",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
        {
          name: "references_for_symbol",
          inputSchema: { type: "object" },
          outputSchema: { type: "object" },
        },
      ],
    });
  if (msg.method === "tools/call") {
    const params = msg.params as { name: string; arguments?: Record<string, unknown> };
    if (params.name === "list_loaded_repos")
      return jsonRpcResult(msg.id ?? null, { repos: FIXTURE_REPOS });
    if (params.name === "search_symbols")
      return jsonRpcResult(msg.id ?? null, { results: FIXTURE_SYMBOLS });
    if (params.name === "references_for_symbol")
      return jsonRpcResult(msg.id ?? null, { edges: [] });
  }
  return null;
}

// CLI mode: read lines from stdin, write JSON-RPC frames to stdout.
if (import.meta.main) {
  const buf = new TextDecoder();
  const stdin = Deno.stdin.readable.getReader();
  let leftover = "";
  // Loop forever; the caller kills us.
  // deno-lint-ignore no-constant-condition
  while (true) {
    const { value, done } = await stdin.read();
    if (done) break;
    leftover += buf.decode(value, { stream: true });
    let nl = leftover.indexOf("\n");
    while (nl >= 0) {
      const line = leftover.slice(0, nl);
      leftover = leftover.slice(nl + 1);
      const out = handle(line);
      if (out) await Deno.stdout.write(new TextEncoder().encode(out));
      nl = leftover.indexOf("\n");
    }
  }
}
