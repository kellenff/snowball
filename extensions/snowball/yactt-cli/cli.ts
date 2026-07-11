// extensions/snowball/yactt-cli/cli.ts
//
// A CLI shim wrapping yactt's MCP-only surface. Each invocation:
//   1. Spawns `yactt mcp serve <repo>` as a child process.
//   2. Speaks JSON-RPC over stdio to call a single tool by name.
//   3. Prints the tool's structuredContent (or content[0].text) to stdout.
//   4. Exits 0 on success; non-zero (with a closed-enum reason on stderr) on failure.
//
// Strategy: open ONE writer, write BOTH RPC frames back-to-back (no
// backpressure races), close stdin, drain responses from the child.
// This avoids the getReader/getWriter stream-locking pitfalls and
// guarantees the child sees both requests before exiting on stdin EOF.

const REPO_FLAG = Deno.args.find((a) => a === "--repo")
if (!REPO_FLAG) {
  console.error("usage: yactt-cli <subcommand> --repo <abs-path> [args]")
  Deno.exit(2)
}
const REPO_PATH = Deno.args[Deno.args.indexOf("--repo") + 1]
if (!REPO_PATH) { console.error("--repo requires an absolute path"); Deno.exit(2) }

const SUBCOMMAND = Deno.args[0]

function collectFlags(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (let i = 0; i < Deno.args.length; i++) {
    const a = Deno.args[i]
    if (a === "--query") { out["query"] = Deno.args[++i]; continue }
    if (a === "--limit") { out["limit"] = Number(Deno.args[++i]); continue }
    if (a === "--file-pattern") { out["file_pattern"] = Deno.args[++i]; continue }
    if (a === "--paths") { out["paths"] = Deno.args[++i].split(","); continue }
  }
  return out
}

const TOOL_NAME: Record<string, string> = {
  "list-loaded-repos":     "list_loaded_repos",
  "search-symbols":        "search_symbols",
  "references-for-symbol": "references_for_symbol",
}
const tool = TOOL_NAME[SUBCOMMAND]
if (!tool) {
  console.error(`unknown subcommand: ${SUBCOMMAND}`)
  Deno.exit(2)
}

function resolveSpawn(resolved: string): { cmd: string; args: string[] } {
  if (resolved.endsWith(".ts")) {
    return { cmd: Deno.execPath(), args: ["run", "--allow-net", "--allow-read", "--allow-write", resolved] }
  }
  return { cmd: resolved, args: [] }
}

const yacttBin = Deno.env.get("YACTT_BIN") ?? "yactt"
const spawn0 = resolveSpawn(yacttBin)

let proc: Deno.ChildProcess
try {
  proc = new Deno.Command(spawn0.cmd, {
    args: [...spawn0.args, "mcp", "serve", REPO_PATH],
    stdin: "piped", stdout: "piped", stderr: "piped",
  }).spawn()
} catch (e) {
  console.error(`graph-unavailable: failed to spawn ${yacttBin}: ${(e as Error).message}`)
  Deno.exit(1)
}

const enc = new TextEncoder()
const decoder = new TextDecoder()

async function dumpAllFrames(): Promise<string> {
  // Read stdout until EOF. Returns everything as a single string (we
  // expect 2 newline-terminated JSON-RPC frames: initialize response,
  // then tools/call response).
  let acc = ""
  try {
    for await (const chunk of proc.stdout) {
      acc += decoder.decode(chunk, { stream: true })
    }
  } catch { /* ignore */ }
  acc += decoder.decode()
  return acc
}

try {
  // Single writer, two frames, then close. This is the simplest pattern
  // and avoids the stream-lock issue.
  const writer = proc.stdin.getWriter()
  const initFrame = JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {} } }) + "\n"
  const callFrame = JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: tool, arguments: collectFlags() } }) + "\n"
  await writer.write(enc.encode(initFrame))
  await writer.write(enc.encode(callFrame))
  await writer.close()

  // Now drain stdout. Set a 30s wall-clock deadline.
  const deadline = setTimeout(() => { console.error("mcp-timeout"); Deno.exit(1) }, 30000)
  const all = await dumpAllFrames()
  clearTimeout(deadline)

  // Find the tools/call response (id 2). Be permissive about whitespace.
  let callJson: string | null = null
  for (const line of all.split("\n")) {
    if (!line.trim()) continue
    try {
      const parsed = JSON.parse(line)
      if (parsed.id === 2) { callJson = line; break }
    } catch { /* skip */ }
  }

  if (!callJson) {
    // Fall back: the server might have collapsed id 1 and id 2 differently; try any frame.
    for (const line of all.split("\n")) {
      if (!line.trim()) continue
      try {
        const parsed = JSON.parse(line)
        if (parsed.id !== 1 && parsed.result) { callJson = line; break }
      } catch { /* skip */ }
    }
  }

  if (!callJson) { console.error("mcp-timeout: no tools/call response"); Deno.exit(1) }

  const parsed = JSON.parse(callJson)
  if (parsed.error) {
    const code = String(parsed.error.code ?? "")
    if (/not.indexed/i.test(parsed.error.message ?? "") || code === "-32004") {
      console.error("repo-not-indexed")
    } else {
      console.error("compute-error")
    }
    Deno.exit(1)
  }

  const payload = parsed.result?.content?.[0]?.json ?? parsed.result
  console.log(JSON.stringify(payload))

  // Tell the child to exit. SIGTERM is a fast shutdown.
  try { proc.kill("SIGTERM") } catch { /* no-op */ }
  await proc.status.catch(() => {})
} catch (e) {
  console.error(`compute-error: ${(e as Error).message}`)
  try { proc.kill("SIGTERM") } catch { /* no-op */ }
  Deno.exit(1)
}
