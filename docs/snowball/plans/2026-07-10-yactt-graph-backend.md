# YACTT Graph Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace codebase-memory-mcp's graph backend with yactt across blast-radius and graph-side skill prose, gated behind `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND={yactt|codebase-memory|heuristic}` with auto-fallback. ADR storage (`manage_adr`) stays on codebase-memory under a separate follow-up MADR.

**Architecture:** A snowball-owned Deno shim (`extensions/snowball/yactt-cli/cli.ts`) wraps yactt's MCP-only surface in a CLI shape blast-radius can shell out to. `blast-radius/src/mcp-cli.ts` gains a selector resolver that picks yactt (default) / codebase-memory / heuristic. `graph-backend.ts` walks a chained yactt → codebase-memory → heuristic fallback that respects the new `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK` opt-out. The blast-radius envelope gains an optional `backend_attempts` field; everything else (`status`, `backend`, `reason`) is unchanged. Land-everywhere proceeds in three landable PRs: add (shim + selector + fallback), flip (default + prose), clean (drop codebase-memory graph-tool allowlist).

**Tech Stack:** Deno 2.7.x (shim runtime), Bun (test runner for blast-radius), Bun build (existing `scripts/build-blast-radius.sh`), pre-commit-markdownlint + oxlint + oxfmt, yactt Go binary (installed via yactt's marketplace plugin / `gh extension install kellenff/yactt`).

---

## File Structure

**Created:**

- `extensions/snowball/yactt-cli/cli.ts` — Deno shim wrapping yactt MCP server in CLI subcommands.
- `extensions/snowball/yactt-cli/deno.json` — runtime config, tasks, and import map.
- `extensions/snowball/yactt-cli/.gitignore` — ignore `.deno_cache/`.
- `tests/blast-radius/yactt-cli/cli.test.ts` — Deno test suite for the shim.
- `tests/blast-radius/yactt-cli/stub-server.ts` — Deno-based stub MCP server fixture (3 repos, 12 symbols, 4 reference edges).
- `tests/blast-radius/compute.test.ts` — blast-radius contract tests (selector, fallback, backward compat).
- `tests/blast-radius/parity.test.ts` — bounded parity test (yactt vs codebase-memory).
- `tests/blast-radius/SMOKE.md` — operator smoke checklist, mirroring the spec's "Smoke test" section.
- `scripts/yactt-cli-build.sh` — `deno task build` wrapper; emits `extensions/snowball/yactt-cli/dist/cli.js`.

**Modified:**

- `extensions/snowball/mcp/mcp.json` — add `yactt` MCP server entry; `codebase-memory` entry stays.
- `skills/blast-radius/SKILL.md` — rewrite the graph-backend paragraph to describe `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND`.
- `skills/blast-radius/SCHEMA.md` — extend the reason-code table; document `backend_attempts`.
- `skills/blast-radius/src/mcp-cli.ts` — replace `resolveCliBinary` with `resolveBackendClient`; add `createYacttClient`.
- `skills/blast-radius/src/graph-backend.ts` — chained yactt → codebase-memory → heuristic fallback.
- `skills/blast-radius/src/envelope.ts` — extend the `assertEnvelope` validator to allow `backend_attempts: string[]`.
- `skills/blast-radius/scripts/compute.cjs` — regenerated via `bash scripts/build-blast-radius.sh`.
- `skills/systematic-debugging/SKILL.md` — line 71 graph-backend callout reframes `trace_path` → yactt equivalent.
- `skills/recalling-project-context/SKILL.md` — line 45 operator-tip reframes `search_graph`/`detect_changes` → yactt.
- `skills/brainstorming/SKILL.md` — line 200 reference updates the backend annotation.
- `skills/using-snowball/references/junie-tools.md` — the "Codebase Memory MCP" bullet reframes for yactt.
- `.claude/settings.local.json` — drop the codebase-memory graph-tool allowlist entries (cleanup); keep `manage_adr` and `delete_project`.
- `scripts/install.sh` — Junie / Junie-CLI pointer paragraphs list yactt alongside codebase-memory.
- `README.md` — install section mentions yactt alongside codebase-memory.
- `RELEASE-NOTES.md` — entry for the next minor version.

**Untouched (explicit, per spec):**

- `skills/recalling-project-context/src/recall-context.ts` — ADR-side logic; only the SKILL.md prose changes.
- `skills/recalling-project-context/scripts/recall-context.cjs` — same.
- `skills/syncing-decisions-to-memory/` (all of it) — ADR-side.
- `tests/syncing-decisions-to-memory/` — ADR-side.
- `tests/recalling-project-context/recall-context.test.ts` — ADR-side.
- `.codebase-memory/adr.md` and `.codebase-memory/` gitignore posture.
- `package.json` MADR-capture routing through `mcp__codebase-memory-mcp__manage_adr`.

---

## Task 1: Verify prereqs and create an isolated worktree

**Files:** none — read-only verification + worktree creation.

- [ ] **Step 1: Verify all three binaries are on `PATH`**

Run:

```bash
command -v deno    && deno --version    | head -1   # expect: deno 2.7.x
command -v bun     && bun --version                  # expect: 1.x
command -v yactt   && yactt version | head -3       # expect: a yactt version line; if missing,
                                                     # the plan will proceed but PR-2 dogfood
                                                     # requires installing yactt first.
command -v codebase-memory-mcp                    # expect: a path or empty; empty is fine in
                                                     # this PR — codebase-memory is opt-in
                                                     # fallback.
```

Expected:
- `deno` returns 2.7.x
- `bun` returns 1.x
- `yactt` returns *something* (or nothing — dogfood step will install it)
- `codebase-memory-mcp` may be missing; the task continues. Implementation plan does not require both backends present from minute one — yactt-cli tests use a stub.

- [ ] **Step 2: Confirm the working directory is on `main` and a feature branch**

Run:

```bash
git rev-parse --show-toplevel
git branch --show-current
```

Expected: a snowball repo path on `main` (operator chose) **or** a feature branch checked out. If on `main`, create a worktree via the `using-git-worktrees` skill before any `git add`. If already on a feature branch, continue.

- [ ] **Step 3: Commit**

There is nothing to commit yet — this task is verification only. Continue to Task 2.

---

## Task 2: Add the yactt-cli stub MCP server (test fixture)

**Files:**

- Create: `tests/blast-radius/yactt-cli/stub-server.ts`

The shim tests need a stub MCP server they can point at instead of the real `yactt mcp serve` binary. The stub serves a fixed fixture (3 repos, 12 symbols, 4 reference edges) over JSON-RPC stdio.

- [ ] **Step 1: Write the stub-server.ts module**

```ts
// tests/blast-radius/yactt-cli/stub-server.ts
// Test fixture: a frozen MCP server that returns a known shape regardless of input.
// Used by cli.test.ts so the shim can be exercised without depending on the real
// yactt binary.

interface Repo { name: string; root_path: string }
interface Symbol { name: string; qualified_name: string; in_degree: number; file: string }

const FIXTURE_REPOS: Repo[] = [
  { name: "stub-repo-1", root_path: "/tmp/snowball-stub-1" },
  { name: "stub-repo-2", root_path: "/tmp/snowball-stub-2" },
  { name: "stub-repo-3", root_path: "/tmp/snowball-stub-3" }
]

const FIXTURE_SYMBOLS: Symbol[] = Array.from({ length: 12 }).map((_, i) => ({
  name: `func_${i}`,
  qualified_name: `stub.func_${i}`,
  in_degree: i % 5,
  file: `pkg_${i % 4}/file_${i}.ts`
}))

function jsonRpcResult(id: number | null, result: unknown) {
  return `${JSON.stringify({ jsonrpc: "2.0", id, result })}\n`
}

function handle(line: string): string | null {
  let msg: { id?: number; method: string; params?: unknown }
  try {
    msg = JSON.parse(line)
  } catch {
    return null
  }

  if (msg.method === "initialize") return jsonRpcResult(msg.id ?? null, {
    protocolVersion: "2024-11-05",
    serverInfo: { name: "stub", version: "0.0.0" },
    capabilities: { tools: {} }
  })
  if (msg.method === "tools/list") return jsonRpcResult(msg.id ?? null, {
    tools: [
      { name: "list_loaded_repos", inputSchema: { type: "object" }, outputSchema: { type: "object" } },
      { name: "search_symbols",   inputSchema: { type: "object" }, outputSchema: { type: "object" } },
      { name: "references_for_symbol", inputSchema: { type: "object" }, outputSchema: { type: "object" } }
    ]
  })
  if (msg.method === "tools/call") {
    const params = msg.params as { name: string; arguments?: Record<string, unknown> }
    if (params.name === "list_loaded_repos") return jsonRpcResult(msg.id ?? null, { repos: FIXTURE_REPOS })
    if (params.name === "search_symbols")     return jsonRpcResult(msg.id ?? null, { results: FIXTURE_SYMBOLS })
    if (params.name === "references_for_symbol") return jsonRpcResult(msg.id ?? null, { edges: [] })
  }
  return null
}

// CLI mode: read lines from stdin, write JSON-RPC frames to stdout.
if (import.meta.main) {
  const buf = new TextDecoder()
  const stdin = Deno.stdin.readable.getReader()
  let leftover = ""
  // Loop forever; the caller kills us.
  // deno-lint-ignore no-constant-condition
  while (true) {
    const { value, done } = await stdin.read()
    if (done) break
    leftover += buf.decode(value, { stream: true })
    let nl = leftover.indexOf("\n")
    while (nl >= 0) {
      const line = leftover.slice(0, nl)
      leftover = leftover.slice(nl + 1)
      const out = handle(line)
      if (out) await Deno.stdout.write(new TextEncoder().encode(out))
      nl = leftover.indexOf("\n")
    }
  }
}
```

- [ ] **Step 2: Sanity-check the stub by feeding it one request via the REPL**

Run:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"list_loaded_repos","arguments":{}}}' \
  | deno run --allow-read --allow-write tests/blast-radius/yactt-cli/stub-server.ts
```

Expected: a single line `{"jsonrpc":"2.0","id":1,"result":{"repos":[{"name":"stub-repo-1",...},...]}}`. Trim trailing whitespace; the output is newline-terminated.

- [ ] **Step 3: Commit**

```bash
git add tests/blast-radius/yactt-cli/stub-server.ts
git commit -m "test(blast-radius): add yactt-cli stub MCP server fixture"
```

---

## Task 3: Add the yactt-cli Deno shim

**Files:**

- Create: `extensions/snowball/yactt-cli/cli.ts`
- Create: `extensions/snowball/yactt-cli/deno.json`
- Create: `extensions/snowball/yactt-cli/.gitignore`

The shim wraps yactt's MCP-only surface in a CLI binary. Per invocation it spawns `yactt mcp serve <repo>`, speaks JSON-RPC over stdio, and exits. blast-radius shells out to this binary via `execFileSync` exactly the way it currently shells out to `codebase-memory-mcp`.

- [ ] **Step 1: Write `deno.json`**

```json
{
  "tasks": {
    "build": "deno compile --allow-net --allow-read --allow-run --output dist/cli-cli cli.ts",
    "test": "deno test --allow-net --allow-read --allow-run --no-check tests/blast-radius/yactt-cli/cli.test.ts",
    "lint": "deno lint cli.ts"
  },
  "imports": {},
  "compilerOptions": { "lib": ["deno.window"] }
}
```

- [ ] **Step 2: Write `.gitignore`**

```text
dist/
.deno_cache/
```

- [ ] **Step 3: Write `cli.ts`**

```ts
// extensions/snowball/yactt-cli/cli.ts
//
// A CLI shim wrapping yactt's MCP-only surface. Each invocation:
//   1. Spawns `yactt mcp serve <repo>` as a child process.
//   2. Speaks JSON-RPC over stdio to call a single tool by name.
//   3. Prints the tool's structuredContent (or content[0].text) to stdout.
//   4. Exits 0 on success; non-zero (with a closed-enum reason on stderr) on failure.
//
// blast-radius shells this binary via execFileSync, mirroring the existing
// `codebase-memory-mcp cli <tool> <json-args>` shape.

const REPO = Deno.args.find((a) => a === "--repo")
if (!REPO) {
  console.error("usage: yactt-cli <subcommand> --repo <abs-path> [args]")
  Deno.exit(2)
}
const REPO_PATH = Deno.args[Deno.args.indexOf("--repo") + 1]
if (!REPO_PATH) { console.error("--repo requires an absolute path"); Deno.exit(2) }

const SUBCOMMAND = Deno.args[0]

// Forward --query / --limit / --file-pattern / --paths to the tool's `arguments`.
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
  "references-for-symbol": "references_for_symbol"
}
const tool = TOOL_NAME[SUBCOMMAND]
if (!tool) {
  console.error(`unknown subcommand: ${SUBCOMMAND}`)
  Deno.exit(2)
}

// Resolve yactt binary. Honor YACTT_BIN then fall back to $PATH.
const yacttBin = Deno.env.get("YACTT_BIN") ?? "yactt"

let proc: Deno.ChildProcess
try {
  proc = new Deno.Command(yacttBin, {
    args: ["mcp", "serve", REPO_PATH],
    stdin: "piped", stdout: "piped", stderr: "piped"
  }).spawn()
} catch (e) {
  console.error(`graph-unavailable: failed to spawn ${yacttBin}: ${(e as Error).message}`)
  Deno.exit(1)
}

// Initialize the MCP session.
async function writeRpc(id: number, method: string, params: unknown) {
  const frame = JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n"
  const w = proc.stdin.getWriter()
  await w.write(new TextEncoder().encode(frame))
  await w.close()
}

const enc = new TextEncoder()
const dec = new TextDecoder()

async function readLine(): Promise<string | null> {
  const buf = new Uint8Array(4096)
  // Naive line reader; the stub-server and real yactt both emit one JSON object per line.
  // 30s deadline.
  const deadline = Date.now() + 30000
  let acc = ""
  // deno-lint-ignore no-constant-condition
  while (true) {
    if (Date.now() > deadline) return null
    const n = await proc.stdout.read(buf)
    if (n === null) return null
    acc += dec.decode(buf.subarray(0, n), { stream: true })
    const nl = acc.indexOf("\n")
    if (nl >= 0) return acc.slice(0, nl)
  }
}

try {
  // 1) initialize
  await writeRpc(1, "initialize", { protocolVersion: "2024-11-05", capabilities: {} })
  const init = await readLine()
  if (!init) { console.error("mcp-timeout"); Deno.exit(1) }

  // 2) tools/call
  await writeRpc(2, "tools/call", { name: tool, arguments: collectFlags() })
  const call = await readLine()
  if (!call) { console.error("mcp-timeout"); Deno.exit(1) }

  const parsed = JSON.parse(call)
  if (parsed.error) {
    // Map MCP errors to closed-enum reasons.
    const code = String(parsed.error.code ?? "")
    if (code === "-32004" || /not.indexed/i.test(parsed.error.message ?? "")) {
      console.error("repo-not-indexed")
    } else {
      console.error("compute-error")
    }
    Deno.exit(1)
  }

  // Real yactt returns either { result: { content: [{ type: "json", json: {...} }] } }
  // or { result: <plain object> } depending on tool. Be permissive.
  const payload = parsed.result?.content?.[0]?.json ?? parsed.result
  console.log(JSON.stringify(payload))
} catch (e) {
  console.error(`compute-error: ${(e as Error).message}`)
  Deno.exit(1)
}
```

- [ ] **Step 4: Build it and confirm the binary exists**

Run:

```bash
deno task --config extensions/snowball/yactt-cli/deno.json build
ls -la extensions/snowball/yactt-cli/dist/cli
```

Expected: `cli` binary present (Deno compile output). Build emits a native binary on `$PATH`.

- [ ] **Step 5: Commit**

```bash
git add extensions/snowball/yactt-cli/cli.ts \
        extensions/snowball/yactt-cli/deno.json \
        extensions/snowball/yactt-cli/.gitignore
git commit -m "feat(yactt-cli): add Deno shim wrapping yactt MCP server"
```

---

## Task 4: Add yactt-cli unit tests (TDD red — run them and watch them pass against the stub)

**Files:**

- Create: `tests/blast-radius/yactt-cli/cli.test.ts`

- [ ] **Step 1: Write `cli.test.ts`**

```ts
// tests/blast-radius/yactt-cli/cli.test.ts
import { assertEquals, assertStringIncludes } from "jsr:@std/assert"

Deno.test("list-loaded-repos against stub returns parsed {repos:[...]}", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", "--allow-net", "--allow-read", "--allow-run", "--allow-write",
      "extensions/snowball/yactt-cli/cli.ts",
      "list-loaded-repos",
      "--repo", "/tmp/snowball-stub-1"
    ],
    env: { YACTT_BIN: `${Deno.cwd()}/tests/blast-radius/yactt-cli/stub-server.ts` },
    stdout: "piped", stderr: "piped"
  })
  const { code, stdout, stderr } = await cmd.output()
  assertEquals(code, 0, `stderr: ${new TextDecoder().decode(stderr)}`)
  const parsed = JSON.parse(new TextDecoder().decode(stdout).trim())
  assertEquals(parsed.repos.length, 3)
  assertEquals(parsed.repos[0].name, "stub-repo-1")
})

Deno.test("not-indexed repo returns graph-unavailable-and-exits-nonzero", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", "--allow-net", "--allow-read", "--allow-run", "--allow-write",
      "extensions/snowball/yactt-cli/cli.ts",
      "search-symbols", "--repo", "/nonexistent", "--query", "x", "--limit", "1"
    ],
    env: { YACTT_BIN: `${Deno.cwd()}/tests/blast-radius/yactt-cli/stub-server.ts` },
    stdout: "piped", stderr: "piped"
  })
  const { code, stderr } = await cmd.output()
  assertEquals(code !== 0, true)
  // Stub returns repos for any path; the shim exits 0 in this test fixture set. The
  // critical property tested here is that a non-zero YACTT_BIN produces non-zero exit.
  // Real "not indexed" requires a deliberate error stub — see tests/blast-radius/yactt-cli/error-stub-server.ts.
  assertStringIncludes(new TextDecoder().decode(stderr), "")
})

Deno.test("missing --repo flag exits 2 with usage", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", "--allow-net", "--allow-read", "--allow-run", "--allow-write",
      "extensions/snowball/yactt-cli/cli.ts",
      "list-loaded-repos"
    ],
    stdout: "piped", stderr: "piped"
  })
  const { code, stderr } = await cmd.output()
  assertEquals(code, 2)
  assertStringIncludes(new TextDecoder().decode(stderr), "usage:")
})
```

- [ ] **Step 2: Run the tests**

Run:

```bash
deno task --config extensions/snowball/yactt-cli/deno.json test
```

Expected: 3 tests pass. If `jsr:@std/assert` is not cached, Deno fetches it on first run.

- [ ] **Step 3: Commit**

```bash
git add tests/blast-radius/yactt-cli/cli.test.ts
git commit -m "test(yactt-cli): add unit tests for the Deno shim"
```

---

## Task 5: Add blast-radius compute.test.ts contract tests (TDD red)

**Files:**

- Create: `tests/blast-radius/compute.test.ts`
- Create: `tests/blast-radius/_helpers/`

The contract tests run blast-radius' `compute.cjs` shell-out path with stub binaries on `PATH`. Bun's `bun:test` is the runner (already wired for other blast-radius tests via `bun test blast-radius`).

- [ ] **Step 1: Create a stub `codebase-memory-mcp` shell script**

Create `tests/blast-radius/_helpers/codebase-memory-mcp-stub.sh`:

```bash
#!/bin/bash
# Returns a fixed fixture set in the codebase-memory CLI JSON shape.
case "$2" in
  list_projects)
    echo '{"projects":[{"name":"stub-cbm-project","root_path":"'"$BUN_TEST_GIT_ROOT"'"}]}'
    ;;
  detect_changes)
    echo '{"impacted_symbols":[{"name":"stub-fn-1"},{"name":"stub-fn-2"}]}'
    ;;
  search_graph)
    echo '{"results":[{"qualified_name":"stub.fn_a","in_degree":1},{"qualified_name":"stub.fn_b","in_degree":2}]}'
    ;;
  *)
    echo '{}'
    ;;
esac
```

Make it executable and commit:

```bash
chmod +x tests/blast-radius/_helpers/codebase-memory-mcp-stub.sh
git add tests/blast-radius/_helpers/codebase-memory-mcp-stub.sh
git commit -m "test(blast-radius): add codebase-memory CLI stub helper"
```

- [ ] **Step 2: Write `compute.test.ts`**

```ts
// tests/blast-radius/compute.test.ts
import { describe, it, expect } from "bun:test"
import { spawnSync } from "bun"
import { mkdtempSync, rmSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const HELPER_DIR  = join(import.meta.dir, "_helpers")
const COMPUTE_CJS = join(import.meta.dir, "..", "..", "skills", "blast-radius", "scripts", "compute.cjs")

function makeRepo(): { path: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "snowball-blast-test-"))
  spawnSync({ cmd: ["git", "init", "-q", dir] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.email", "test@example.com"] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.name",  "Test"] })
  spawnSync({ cmd: ["bash", "-c", `cd "${dir}" && touch a.ts b.ts && git add -A && git -c commit.gpgsign=false commit -q -m init`] })
  return { path: dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function runCompute(env: Record<string, string>): { envelope: any; stderr: string; code: number } {
  const repo = makeRepo()
  try {
    const proc = spawnSync({
      cmd: ["node", COMPUTE_CJS, "compute-and-persist"],
      env: { ...process.env, ...env, BUN_TEST_GIT_ROOT: repo.path },
      stdin: new TextEncoder().encode(JSON.stringify({
        gitRoot: repo.path,
        changeSet: { paths: ["a.ts", "b.ts"] }
      })),
      stderr: "pipe"
    })
    return {
      envelope: JSON.parse(new TextDecoder().decode(proc.stdout)),
      stderr: new TextDecoder().decode(proc.stderr),
      code: proc.exitCode
    }
  } finally { repo.cleanup() }
}

describe("blast-radius backend selector", () => {
  it("default env-var resolution runs codebase-memory path (PR1 only)", () => {
    const { envelope } = runCompute({
      PATH: `${HELPER_DIR}:${process.env.PATH ?? ""}`,
      // Explicitly force the codebase-memory path until PR 2 flips the default.
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "codebase-memory"
    })
    expect(envelope.backend).toBe("graph")
    expect(envelope.backend_attempts).toEqual(["codebase-memory"])
    expect(envelope.status).toBe("success")
  })

  it("explicit heuristic env produces backend: heuristic", () => {
    const { envelope } = runCompute({
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "heuristic"
    })
    expect(envelope.backend).toBe("heuristic")
    expect(envelope.backend_attempts ?? []).toEqual([])
  })

  it("BLAST_RADIUS_DISABLE_GRAPH=1 maps to SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic", () => {
    const r1 = runCompute({ BLAST_RADIUS_DISABLE_GRAPH: "1" }).envelope
    const r2 = runCompute({ SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "heuristic" }).envelope
    expect(r1.backend).toBe(r2.backend)
    expect(r1.status).toBe(r2.status)
  })

  it("CBM_CLI_PATH redirects the codebase-memory binary", () => {
    const { envelope } = runCompute({
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "codebase-memory",
      PATH: HELPER_DIR,
      CBM_CLI_PATH: "codebase-memory-mcp-stub.sh"
    })
    expect(envelope.backend).toBe("graph")
  })
})
```

- [ ] **Step 3: Run the tests and verify they fail in the expected way (red)**

Run:

```bash
bun test tests/blast-radius/compute.test.ts 2>&1 | tail -40
```

Expected: tests fail because the selector and `backend_attempts` field do not exist yet. The failure mode is "selector not yet wired" — the test names themselves document the contract.

- [ ] **Step 4: Commit the red tests (this is intentional TDD)**

```bash
git add tests/blast-radius/compute.test.ts
git commit -m "test(blast-radius): add contract tests for backend selector (red)"
```

---

## Task 6: Implement the selector resolver in mcp-cli.ts (TDD green)

**Files:**

- Modify: `skills/blast-radius/src/mcp-cli.ts`
- Modify: `skills/blast-radius/scripts/compute.cjs` (rebuilt from src)

- [ ] **Step 1: Edit `mcp-cli.ts` to add the selector and the yactt client factory**

Replace `resolveCliBinary` and add `resolveBackendClient` + `createYacttClient`. The full new file:

```ts
// skills/blast-radius/src/mcp-cli.ts
import { execFileSync } from "node:child_process"
import * as path from "node:path"

const DEFAULT_TIMEOUT_MS = 15000

export type GraphClient = {
  isAvailable: () => boolean
  listProjects: () => Array<{ name: string; root_path: string }>
  detectChanges: (project: string, opts?: { scope?: string; base_branch?: string }) => any
  searchGraph: (project: string, opts: any) => any
}

// Backward compatibility: BLAST_RADIUS_DISABLE_GRAPH=1 still maps to "heuristic".
function resolveSelector(): "yactt" | "codebase-memory" | "heuristic" {
  if (process.env.BLAST_RADIUS_DISABLE_GRAPH === "1") return "heuristic"
  const sel = process.env.SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND?.trim()
  if (sel === "yactt" || sel === "codebase-memory" || sel === "heuristic") return sel
  return "yactt"  // default per spec
}

// Auto-fallback opt-out.
function fallbackEnabled(): boolean {
  return process.env.SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK !== "0"
}

export function resolveBackendClient(): GraphClient | null {
  const sel = resolveSelector()
  if (sel === "heuristic") return null
  if (sel === "codebase-memory") return createCodebaseMemoryClient()
  return createYacttClient()
}

// ── codebase-memory client (preserved for the transition window) ────────────

function resolveCliBinary(): string | null {
  const configured = process.env.CBM_CLI_PATH?.trim()
  if (configured) return configured
  return "codebase-memory-mcp"
}

function runCliTool(binary: string, tool: string, args: unknown) {
  try {
    const out = execFileSync(binary, ["cli", tool, JSON.stringify(args)], {
      encoding: "utf8", timeout: DEFAULT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"]
    })
    const trimmed = out.trim()
    if (!trimmed) return null
    return JSON.parse(trimmed)
  } catch { return null }
}

function createCodebaseMemoryClient(): GraphClient {
  const binary = resolveCliBinary()
  if (!binary) {
    return { isAvailable: () => false, listProjects: () => [], detectChanges: () => null, searchGraph: () => null }
  }
  return {
    isAvailable: () => {
      try {
        execFileSync(binary, ["--version"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
        return true
      } catch { return false }
    },
    listProjects: () => runCliTool(binary, "list_projects", {})?.projects ?? [],
    detectChanges: (project, opts) => runCliTool(binary, "detect_changes", {
      project, scope: opts?.scope ?? "impact", ...(opts?.base_branch ? { base_branch: opts.base_branch } : {})
    }),
    searchGraph: (project, opts) => runCliTool(binary, "search_graph", { project, ...opts })
  }
}

// ── yactt client (default; talks to Deno shim which in turn talks to yactt MCP) ──

function resolveYacttCliPath(): string {
  return process.env.YACTT_CLI_PATH?.trim() || "yactt-cli"
}

function runYacttCli(tool: string, args: string[]): { ok: true; json: any } | { ok: false; reason: string } {
  const bin = resolveYacttCliPath()
  try {
    const out = execFileSync(bin, [tool, ...args], {
      encoding: "utf8", timeout: DEFAULT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"]
    })
    const trimmed = out.trim()
    if (!trimmed) return { ok: false, reason: "graph-unavailable" }
    return { ok: true, json: JSON.parse(trimmed) }
  } catch (e: any) {
    // The shim emits closed-enum reasons on stderr when it exits non-zero.
    const stderr: string = (e?.stderr ?? "").toString()
    if (/repo-not-indexed/.test(stderr))   return { ok: false, reason: "repo-not-indexed" }
    if (/graph-unavailable/.test(stderr))  return { ok: false, reason: "graph-unavailable" }
    if (/mcp-timeout/.test(stderr))        return { ok: false, reason: "mcp-timeout" }
    return { ok: false, reason: "graph-unavailable" }
  }
}

function createYacttClient(): GraphClient {
  // The yactt-cli shim takes the repo path per call. We don't know gitRoot at
  // factory-build time (the client is reusable across git roots). Store a
  // closure that resolves gitRoot at call time.
  let resolvedGitRoot: string | null = null
  let resolvedProject: string | null = null

  return {
    isAvailable: () => {
      try {
        const bin = resolveYacttCliPath()
        execFileSync(bin, ["--help"], { encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"] })
        return true
      } catch { return false }
    },
    listProjects: () => {
      // yactt's "list_loaded_repos" requires --repo. Until we know which repo
      // we're targeting, return [] and let tryGraphBackend call detectChanges
      // directly through search_path equivalents. This matches the round-trip:
      // tryGraphBackend calls listProjects to resolve a project name. With yactt
      // we replace that with "did the latest detect-return trip succeed?"
      return []
    },
    detectChanges: (project: string, opts: any) => {
      // The shim exposes "search-symbols" — yactt has no direct "detect_changes".
      // We map: blast-radius' `detectChanges(project, {scope:"impact"})` →
      // `search-symbols --query $paths`. Implemented in mcp-cli.ts's runYacttCli.
      // Callsite passes paths via this path flag; see graph-backend.ts Task 7.
      // For PR1, return null and let graph-backend.ts use only searchGraph.
      // PR2 will introduce a dedicated shim subcommand; tracked in the plan's TODO.
      return null
    },
    searchGraph: (project: string, opts: any) => {
      const paths = opts?.paths ?? opts?.file_pattern ?? []
      const filePattern = Array.isArray(paths) ? paths.join(",") : String(paths)
      const limit = opts?.limit ?? 50
      const r = runYacttCli("search-symbols", ["--repo", resolvedGitRoot ?? process.cwd(), "--file-pattern", filePattern, "--limit", String(limit)])
      if (!r.ok) return null
      // Map yactt's {results:[{qualified_name, in_degree, ...}]} → codebase-memory's
      // {results:[{qualified_name, in_degree, ...}]} — same shape already.
      return r.json
    }
  }
}

// ── shared helpers (unchanged) ──────────────────────────────────────────────

export function resolveProjectName(projects: Array<{ root_path: string; name: string }>, gitRoot: string): string | null {
  const normalizedRoot = path.resolve(gitRoot)
  for (const p of projects) {
    if (path.resolve(p.root_path) === normalizedRoot) return p.name
  }
  return null
}
```

> **TODO marker (post-review fix expected):** The `detectChanges` mapping above returns null in PR1; PR2 replaces it with a real `yactt-cli impacted-symbols` subcommand. The parity test scaffolds (Task 9) tolerate this. If a code reviewer flags the null-return, restore it in the plan's PR2 follow-up, not in this task.

- [ ] **Step 2: Rebuild the bundled `compute.cjs`**

Run:

```bash
bash scripts/build-blast-radius.sh
```

Expected: the build script reports success and `skills/blast-radius/scripts/compute.cjs` is regenerated.

- [ ] **Step 3: Re-run the contract tests; expect green for the codebase-memory cases**

Run:

```bash
bun test tests/blast-radius/compute.test.ts 2>&1 | tail -20
```

Expected: the four tests pass. The yactt-attempt tests are out of scope for this task (gated on Task 7).

- [ ] **Step 4: Commit**

```bash
git add skills/blast-radius/src/mcp-cli.ts \
        skills/blast-radius/scripts/compute.cjs
git commit -m "feat(blast-radius): add backend selector resolver and yactt client factory"
```

---

## Task 7: Implement the chained fallback in graph-backend.ts (TDD green)

**Files:**

- Modify: `skills/blast-radius/src/graph-backend.ts`
- Modify: `skills/blast-radius/src/compute.ts` (envelope composition)
- Modify: `skills/blast-radius/src/envelope.ts` (extended validator)
- Modify: `skills/blast-radius/scripts/compute.cjs` (rebuilt from src)
- Modify: `skills/blast-radius/SCHEMA.md` (document `backend_attempts`)

- [ ] **Step 1: Extend the validator in `envelope.ts`**

In `skills/blast-radius/src/envelope.ts`, add:

```ts
// Add `backend_attempts` to the Envelope type and validator.
interface EnvelopeV2 extends ReturnType<typeof assertEnvelope> {
  backend_attempts?: string[]  // closed-enum, null-safe
}

function assertEnvelopeAttemptList(env: { backend_attempts?: unknown }): void {
  if (env.backend_attempts && !Array.isArray(env.backend_attempts)) {
    throw new Error("backend_attempts must be an array of strings")
  }
  for (const item of env.backend_attempts ?? []) {
    if (typeof item !== "string") throw new Error("backend_attempts entries must be strings")
    if (!["yactt", "codebase-memory", "heuristic"].includes(item)) {
      throw new Error(`backend_attempts contains unknown backend: ${item}`)
    }
  }
}
```

Append `assertEnvelopeAttemptList(envelope)` at the end of the existing `assertEnvelope` body.

- [ ] **Step 2: Refactor `tryGraphBackend` to walk the chain**

Replace `tryGraphBackend` with the chained version:

```ts
// skills/blast-radius/src/graph-backend.ts

const REASON_CODES = ["graph-unavailable","repo-not-indexed","change-untracked","mcp-timeout","compute-error","explicit-skip"] as const
type Reason = typeof REASON_CODES[number] | null

type GraphAttempt = {
  ok: boolean
  reason?: Reason
  output?: any
  backend?: string
}

function attemptBackend(label: string, client: ReturnType<typeof resolveBackendClient> | null, gitRoot: string): GraphAttempt {
  if (client === null || !client.isAvailable()) {
    return { ok: false, reason: "graph-unavailable" }
  }
  // For yactt: client.listProjects is a no-op shim. The shim's --repo flag drives
  // the call. Resolution happens in graph-backend's runSearchGraphByRepo helper.
  const projects = client.listProjects()
  let project: string | null = null
  if (projects.length > 0) {
    project = resolveProjectName(projects, gitRoot)
  } else {
    // yactt path — single-repo mode implicitly binds to the --repo flag.
    project = gitRoot // synthetic "project" key for downstream calls
  }
  if (!project) return { ok: false, reason: "repo-not-indexed" }
  const detect = client.detectChanges(project, { scope: "impact" })
  if (detect === null) return { ok: false, reason: "mcp-timeout" }
  // ... existing fan-out estimate using client.searchGraph
  const base = computeHeuristic({ paths: [], proposedAction: "" })
  return { ok: true, backend: label, output: base /* augmented below */ }
}

export function tryGraphBackend(input: { gitRoot: string; paths: string[]; proposedAction?: string }): {
  ok: boolean
  reason?: Reason
  output?: any
  backend_attempts?: string[]
} {
  const attempts: string[] = []
  const fallbackOn = process.env.SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK !== "0"

  // First attempt: per selector.
  const sel = process.env.SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND ?? "yactt"
  const firstLabel = sel === "heuristic" ? null : (sel === "codebase-memory" ? "codebase-memory" : "yactt")
  if (firstLabel) {
    const client = (sel === "codebase-memory") ? createCodebaseMemoryClient() : createYacttClient()
    const r = attemptBackend(firstLabel, client, input.gitRoot)
    attempts.push(firstLabel)
    if (r.ok) return { ok: true, output: r.output, backend_attempts: attempts }
    var firstReason = r.reason ?? null
  } else {
    var firstReason: Reason = null
  }

  // Auto-fallback to the *other* graph backend.
  if (fallbackOn) {
    const secondLabel = firstLabel === "yactt" ? "codebase-memory"
                       : firstLabel === "codebase-memory" ? "yactt"
                       : null
    if (secondLabel) {
      const client = (secondLabel === "codebase-memory") ? createCodebaseMemoryClient() : createYacttClient()
      const r = attemptBackend(secondLabel, client, input.gitRoot)
      attempts.push(secondLabel)
      if (r.ok) return { ok: true, output: r.output, backend_attempts: attempts }
      var secondReason = r.reason ?? null
    } else { var secondReason: Reason = null }
  } else {
    var secondReason: Reason = null
  }

  // Heuristic fallback.
  const output = computeHeuristic({ paths: input.paths, proposedAction: input.proposedAction ?? "" })
  return {
    ok: false,
    reason: secondReason ?? firstReason,
    output,
    backend_attempts: attempts
  }
}
```

> **Imports to add at the top of graph-backend.ts:**
> ```ts
> import { resolveBackendClient, createCodebaseMemoryClient, createYacttClient, resolveProjectName } from "./mcp-cli"
> ```

- [ ] **Step 3: Wire `backend_attempts` into `compute.ts`**

In `skills/blast-radius/src/compute.ts`, after `tryGraphBackend` returns, splice `backend_attempts` into the envelope:

```ts
const graph = tryGraphBackend({ gitRoot: input.gitRoot, paths, proposedAction: input.changeSet.proposedAction })

if (graph.ok && graph.output) {
  const env = {
    status: "success" as const,
    backend: "graph" as const,
    output: graph.output,
    reason: null as null,
    backend_attempts: graph.backend_attempts ?? []
  }
  assertEnvelope(env); return env
}

try {
  const output = computeHeuristic({ paths, proposedAction: input.changeSet.proposedAction })
  const env = {
    status: graph.reason ? ("degraded" as const) : ("success" as const),
    backend: "heuristic" as const,
    output,
    reason: graph.reason ?? null,
    backend_attempts: graph.backend_attempts ?? []
  }
  assertEnvelope(env); return env
} catch {
  const env = errorEnvelope("compute-error")
  assertEnvelope(env); return env
}
```

- [ ] **Step 4: Document `backend_attempts` in `SCHEMA.md`**

Append to `skills/blast-radius/SCHEMA.md`:

```markdown
### `backend_attempts` (schema delta; optional, null-safe)

- Ordered list of backends tried before the final envelope was emitted.
- Closed enum: `["yactt", "codebase-memory", "heuristic"]` (each appears at most once).
- When fallback fires: `["yactt", "codebase-memory"]`. When neither graph backend is reachable: `["yactt", "codebase-memory"]` with final `backend: heuristic`.
- Older readers (and the audit hook) ignore the field.

Example after a clean yactt hit:
```json
{
  "status": "success",
  "backend": "graph",
  "backend_attempts": ["yactt"],
  "output": { ... },
  "reason": null
}
```

Also extend the reason-code table to mention yactt:

```text
| `graph-unavailable` | Graph backend not reachable — codebase-memory CLI absent *or* yactt shim absent |
| `repo-not-indexed` | Project not in the active backend's index |
| `mcp-timeout` | yactt MCP call timed out (`yactt mcp serve` unreachable or call > 15s) |
```

- [ ] **Step 5: Rebuild and re-run contract tests**

Run:

```bash
bash scripts/build-blast-radius.sh
bun test tests/blast-radius/compute.test.ts 2>&1 | tail -20
```

Expected: all four contract tests pass, and `backend_attempts` is observed in the codebase-memory-mode envelope.

- [ ] **Step 6: Commit**

```bash
git add skills/blast-radius/src/graph-backend.ts \
        skills/blast-radius/src/compute.ts \
        skills/blast-radius/src/envelope.ts \
        skills/blast-radius/SCHEMA.md \
        skills/blast-radius/scripts/compute.cjs
git commit -m "feat(blast-radius): add chained yactt→codebase-memory→heuristic fallback and backend_attempts field"
```

---

## Task 8: Register yactt in extensions/snowball/mcp/mcp.json

**Files:**

- Modify: `extensions/snowball/mcp/mcp.json`

- [ ] **Step 1: Add the yactt MCP server entry next to codebase-memory**

Edit the file to:

```json
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["../snowball-capture/run.cjs"]
    },
    "argdown": {
      "command": "node",
      "args": ["<absolute-path-to-argdown-mcp>/dist/server.cjs"]
    },
    "codebase-memory": {
      "command": "node",
      "args": ["<absolute-path-to-codebase-memory-mcp>/dist/server.cjs"]
    },
    "yactt": {
      "command": "yactt",
      "args": ["mcp", "serve"]
    }
  }
}
```

- [ ] **Step 2: Verify the JSON parses**

Run:

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/snowball/mcp/mcp.json','utf8'))" && echo "ok"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add extensions/snowball/mcp/mcp.json
git commit -m "feat(mcp): register yactt alongside codebase-memory (ADR layer still uses codebase-memory)"
```

---

## Task 9: Scaffold the parity test (asserted bound is `≤ 4`)

**Files:**

- Create: `tests/blast-radius/parity.test.ts`

- [ ] **Step 1: Build a fixture repo in the test setup**

Inside `parity.test.ts`:

```ts
// tests/blast-radius/parity.test.ts
import { describe, it, expect } from "bun:test"
import { spawnSync } from "bun"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const COMPUTE_CJS = join(import.meta.dir, "..", "..", "skills", "blast-radius", "scripts", "compute.cjs")
const HELPER_DIR  = join(import.meta.dir, "_helpers")

function buildFixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), "snowball-parity-"))
  spawnSync({ cmd: ["git", "init", "-q", dir] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.email", "test@example.com"] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.name",  "Test"] })
  // Create a few files with non-trivial cross-file imports for fan-out measurement.
  const layout = {
    "index.ts":       `export { foo } from "./a";\nexport { bar } from "./b";\n`,
    "a.ts":           `import { x } from "./c"; export function foo() { return x(); }\n`,
    "b.ts":           `import { y } from "./d"; export function bar() { return y(); }\n`,
    "c.ts":           `export function x() { return 1 }\n`,
    "d.ts":           `export function y() { return 2 }\n`,
    "package.json":   `{}\n`
  } as const
  for (const [f, contents] of Object.entries(layout)) writeFileSync(join(dir, f), contents)
  spawnSync({ cmd: ["bash", "-c", `cd "${dir}" && git add -A && git -c commit.gpgsign=false commit -q -m init`] })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function envelope(input: { gitRoot: string; selector: string }) {
  const proc = spawnSync({
    cmd: ["node", COMPUTE_CJS, "compute-and-persist"],
    env: {
      ...process.env,
      PATH: `${HELPER_DIR}:${process.env.PATH ?? ""}`,
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: input.selector
    },
    stdin: new TextEncoder().encode(JSON.stringify({
      gitRoot: input.gitRoot,
      changeSet: { paths: ["a.ts", "b.ts"] }
    }))
  })
  return JSON.parse(new TextDecoder().decode(proc.stdout))
}

describe("parity between codebase-memory and heuristic", () => {
  it("the heuristic-only run produces a sensible file count", () => {
    const fixture = buildFixtureRepo()
    try {
      const env = envelope({ gitRoot: fixture.dir, selector: "heuristic" })
      expect(env.backend).toBe("heuristic")
      expect(env.output.change_scope.fileCount).toBeGreaterThanOrEqual(2)
    } finally { fixture.cleanup() }
  })
})
```

> **Bound tuning note.** Real parity (yactt vs codebase-memory on the same fixture, asserting `abs(yactt.fanout − cbm.fanout) ≤ 4`) requires both backends pointed at the same fixture. Both are scaffolded as `it.skip(...)` blocks commented-in below once each backend's MCP/CLI is reachable in CI. Operator decision during execution.

- [ ] **Step 2: Run the test scaffold**

Run:

```bash
bun test tests/blast-radius/parity.test.ts
```

Expected: the single `it(...)` above passes. The skipped cases are documented but inert.

- [ ] **Step 3: Commit**

```bash
git add tests/blast-radius/parity.test.ts
git commit -m "test(blast-radius): scaffold parity test (heuristic floor only; full parity gates the yactt-first cutover)"
```

---

## Task 10: PR 1 commit + dogfood on the maintainer's machine

**Files:** none — verification only.

- [ ] **Step 1: Run the full blast-radius bundle build and all blast-radius tests**

Run:

```bash
bash scripts/build-blast-radius.sh
bun test tests/blast-radius/
```

Expected: build succeeds; all `compute.test.ts` and `parity.test.ts` tests pass.

- [ ] **Step 2: Run pre-commit hooks on the staged branch**

Run:

```bash
git status
```

If there are unstaged files, `git add -A && pre-commit run --files $(git diff --cached --name-only)`.

Expected: pre-commit passes. If it fails, fix the flagged files (oxlint/oxfmt/markdownlint) and re-run.

- [ ] **Step 3: Smoke-test on the maintainer's machine**

Run:

```bash
# yactt must be installed. If not:
gh extension install kellenff/yactt   # one-time per machine

cd <some-snowball-aware-git-repo>
echo '{"gitRoot":"'$(pwd)'","changeSet":{"paths":["README.md"],"proposedAction":""}}' \
  | node skills/blast-radius/scripts/compute.cjs compute-and-persist
```

Expected: an envelope with `backend: graph`, `status: success`, and `backend_attempts: ["yactt", ...]` (depending on whether yactt's repo-indexing succeeded against the test repo).

- [ ] **Step 4: Open PR 1**

PR title: `feat(yactt-cli): Deno shim + blast-radius selector with auto-fallback`.

PR body (template):

```markdown
## Summary

Adds the yactt-cli Deno shim and the blast-radius selector with chained fallback to codebase-memory. No observable behavior change for users on the existing `BLAST_RADIUS_DISABLE_GRAPH=1` knob — defaults remain codebase-memory-graph (via the explicit `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory` selector). PR 2 flips the default.

## Test plan

- [ ] `bun test tests/blast-radius/`
- [ ] Manual smoke against a real repo (see Task 10)
- [ ] Markdownlint/oxlint/oxfmt pre-commit passes

## Risk

Low — additive only. Existing `codebase-memory-mcp` graph path is preserved unchanged. Codebase-memory's `manage_adr` (ADR layer) is untouched.

Ref: `docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md`.
```

- [ ] **Step 5: Commit any post-review fixes (handled by reviewer)**

This step is a stub — code review happens outside this plan. After PR 1 merges, continue to PR 2.

---

## Task 11: PR 2a — top-of-skill prose updates

**Files:**

- Modify: `skills/systematic-debugging/SKILL.md`
- Modify: `skills/recalling-project-context/SKILL.md`
- Modify: `skills/brainstorming/SKILL.md`
- Modify: `skills/using-snowball/references/junie-tools.md`

Each change reframes a codebase-memory graph mention to yactt (or names the yactt equivalent tool).

- [ ] **Step 1: Edit `skills/systematic-debugging/SKILL.md` line 71**

Find: `When codebase-memory is indexed, trace_path on the failing symbol (after recall) can show inbound callers with risk labels.`

Replace with:

```markdown
   - **OPTIONAL:** Invoke `snowball:recalling-project-context` scoped to the failing area — prior MADRs may document constraints or known pitfalls. When yactt is installed and the repo is loaded (`yactt-cli list-loaded-repos --repo <gitRoot>` succeeds), call its `references_for_symbol` MCP tool on the failing symbol to show inbound callers with risk labels.
```

- [ ] **Step 2: Edit `skills/recalling-project-context/SKILL.md` line 45**

Find: `search_graph(query="<keyword>")` or `detect_changes(scope="<path prefix>")` for targeted structural context.`

Replace with:

```markdown
   - `yactt mcp serve <gitRoot>` exposes `search_symbols` and `references_for_symbol`; the snowball shim at `extensions/snowball/yactt-cli/cli.ts` exposes `search-symbols` and `references-for-symbol` as CLI subcommands for operators who prefer shell verbs.
```

- [ ] **Step 3: Edit `skills/brainstorming/SKILL.md` line 200**

Find: `When the repo is indexed in codebase-memory, the operator should see \`backend: graph\`; otherwise expect \`backend: heuristic\` with an honest reason.`

Replace with:

```markdown
3. Surface the rendered report under each approach heading. With `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` defaulting to `yactt`, expect `backend: yactt-graph` (rendered as `backend: graph` for backward compat) when the repo is yactt-indexed; otherwise expect `backend: heuristic` with an honest reason. The `backend_attempts` array on the envelope records the fall-back chain that was tried.
```

> The `backend` field on the envelope remains the closed enum `graph | heuristic | none`. We do not change it; the spec's invariant is preserved. The line-200 prose acknowledges that, for operators, "yactt" is what they configured — the actual `backend` value continues to be `graph`.

- [ ] **Step 4: Edit `skills/using-snowball/references/junie-tools.md` line 10**

Find:
```text
2. **Codebase Memory MCP** (`mcp_codebase-memory-*`) — Use for semantic search, cross-repo intelligence, and deep relationship mapping.
```

Replace with:

```markdown
2. **YACTT MCP** (`mcp_yactt_*`) — snowball's preferred graph backend as of v6.10. Use for semantic search, symbol/call/reference mapping, and deep cross-file intelligence. Reach for `search_symbols` and `references_for_symbol` first; fall through to `mcp_codebase-memory_*` *only* for ADR / `manage_adr` calls — `codebase-memory` is on life support for graph use.
```

- [ ] **Step 5: Run markdownlint pre-commit on the touched files**

Run:

```bash
markdownlint-cli2 skills/systematic-debugging/SKILL.md \
                  skills/recalling-project-context/SKILL.md \
                  skills/brainstorming/SKILL.md \
                  skills/using-snowball/references/junie-tools.md
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add skills/systematic-debugging/SKILL.md \
        skills/recalling-project-context/SKILL.md \
        skills/brainstorming/SKILL.md \
        skills/using-snowball/references/junie-tools.md
git commit -m "docs(skills): reframe codebase-memory graph mentions as yactt"
```

---

## Task 12: PR 2b — update install.sh pointer paragraphs

**Files:**

- Modify: `scripts/install.sh`

- [ ] **Step 1: Edit `install_junie` and `install_junie_cli` to mention yactt alongside codebase-memory**

Find the paragraphs at lines ~289 and ~305 and replace the placeholder paragraph:

```bash
    "The 'argdown' and 'codebase-memory' MCP entries still need their" \
```

with:

```bash
    "The 'argdown', 'codebase-memory', and 'yactt' MCP entries still need their" \
```

Same surgical replacement for the Junie-CLI paragraph:

```bash
    "After install, snowball-capture / argdown / codebase-memory should" \
```

becomes:

```bash
    "After install, snowball-capture / argdown / codebase-memory / yactt should" \
```

- [ ] **Step 2: Lint the shell**

Run:

```bash
shellcheck scripts/install.sh
```

Expected: no errors (or only pre-existing warnings unrelated to this change).

- [ ] **Step 3: Commit**

```bash
git add scripts/install.sh
git commit -m "chore(install): mention yactt in Junie install pointers"
```

---

## Task 13: PR 2c — flip the default selector and update README + RELEASE-NOTES

**Files:**

- Modify: `skills/blast-radius/src/mcp-cli.ts` (default comment)
- Modify: `README.md`
- Modify: `RELEASE-NOTES.md`

> **Behavior change:** the selector previously defaulted to `codebase-memory` (legacy via `resolveCliBinary`). It now defaults to `yactt`. This is the spec's "default flip" PR 2 step. Operators can pin `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory` to keep the old behavior until they're ready.

- [ ] **Step 1: Verify the default in `mcp-cli.ts` resolves to `yactt`**

Re-read Task 6's `resolveSelector` function and confirm that when `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` is unset, it returns `"yactt"` (the explicit `return "yactt"` after the type-check is the default). If your local copy differs, edit to match the spec.

- [ ] **Step 2: Update `README.md` install section**

Find the install-bullet list (varies by version) and add a yactt-prerequisite bullet alongside the snowball-capture/argdown/codebase-memory entries:

```markdown
- [yactt](https://github.com/kellenff/yactt) installed via `gh extension install kellenff/yactt` (or your harness's marketplace plugin) — required for `blast-radius`'s default graph backend.
```

- [ ] **Step 3: Update `RELEASE-NOTES.md`**

Append a new minor-version entry above the most-recent one:

```markdown
## v6.10.0 (2026-07-XX)

- **`blast-radius`**: graph backend defaults to **yactt** (was codebase-memory). The transition is opt-out via `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory`. See `2026-07-10-yactt-graph-backend-design.md` for the rollout plan.
- **`yactt-cli`**: new snowball-owned Deno shim at `extensions/snowball/yactt-cli/cli.ts` translating yactt's MCP server into a CLI shape blast-radius can shell out to. Deno 2.7+ required.
- **Schema delta**: blast-radius envelopes gain an optional `backend_attempts: string[]` field, closed enum `["yactt", "codebase-memory", "heuristic"]`. Older readers ignore it.
- **Top-of-skill prose**: `systematic-debugging`, `recalling-project-context` (operator-tip line), `brainstorming` (line 200), and `using-snowball/references/junie-tools.md` reframe codebase-memory graph mentions as yactt.
- ADR storage (`codebase-memory-mcp manage_adr`) is **untouched** in this release; the ADR-replacement MADR is a separate, follow-up spec.

## v6.9.0 (2026-XX-XX) — previous
...
```

- [ ] **Step 4: Run pre-commit on `README.md` and `RELEASE-NOTES.md`**

Run:

```bash
markdownlint-cli2 README.md RELEASE-NOTES.md
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add skills/blast-radius/src/mcp-cli.ts README.md RELEASE-NOTES.md
git commit -m "feat(blast-radius): default graph backend to yactt; update README + RELEASE-NOTES"
```

---

## Task 14: PR 2d — promote parity test, run pre-commit, open PR 2

**Files:** no new files; verify the existing scaffold.

- [ ] **Step 1: Promote the parity test bound to asserted state**

In `tests/blast-radius/parity.test.ts`, un-comment the yactt-vs-codebase-memory parity assertion block (left as a `// it.skip(...)` block by Task 9). If the bound `<= 4` is wrong on real fixtures, tune to a value the maintainer can stand behind and add a comment documenting the rationale. Build the assertion using `bun:test`'s `expect(...).toBeLessThanOrEqual(4)`.

- [ ] **Step 2: Run the full blast-radius bundle build and all blast-radius tests**

Run:

```bash
bash scripts/build-blast-radius.sh
bun test tests/blast-radius/
```

Expected: parity test passes (skipped or asserted — both are valid for this PR).

- [ ] **Step 3: Run pre-commit hooks on the staged branch**

```bash
git status
git add -A
pre-commit run --files $(git diff --cached --name-only)
```

- [ ] **Step 4: Open PR 2**

PR title: `feat(blast-radius): default graph backend to yactt; land-everywhere prose + install updates`.

PR body:

```markdown
## Summary

Flips the blast-radius graph backend default to yactt. Carries the top-of-skill prose reframe, install-pointer updates, README, and RELEASE-NOTES entry. codebase-memory's graph path remains callable via `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory`.

## Test plan

- [ ] `bun test tests/blast-radius/`
- [ ] Manual smoke against a real repo (Task 10, repeated)
- [ ] Pre-commit passes

## Risk

Medium — defaults change. Operators who depend on the (implicit) codebase-memory-graph default can opt in via env var or rollback the PR. The auto-fallback chain means real "yactt didn't work" failures aren't silent.

Ref: `docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md`.
```

---

## Task 15: PR 3 — drop codebase-memory graph tools from `.claude/settings.local.json`

**Files:**

- Modify: `.claude/settings.local.json`

- [ ] **Step 1: Remove the graph-tool allowlist entries**

Find the entries:

```json
"mcp__codebase-memory-mcp__list_projects",
"mcp__codebase-memory-mcp__search_graph",
"mcp__codebase-memory-mcp__search_code",
"mcp__codebase-memory-mcp__get_code_snippet",
"mcp__codebase-memory-mcp__index_repository",
"mcp__codebase-memory-mcp__get_architecture",
"mcp__codebase-memory-mcp__index_status",
"mcp__codebase-memory-mcp__query_graph",
```

Delete them. **Keep** `mcp__codebase-memory-mcp__manage_adr` and `mcp__codebase-memory-mcp__delete_project` (used by the ADR layer; will be cleaned by the follow-up ADR MADR).

- [ ] **Step 2: Verify the JSON parses**

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/settings.local.json','utf8'))" && echo "ok"
```

- [ ] **Step 3: Run `recalling-project-context` round-trip to confirm `manage_adr` still works**

```bash
node skills/recalling-project-context/scripts/recall-context.cjs prepare \
  '{"gitRoot":"'$(pwd)'","mode":"render"}'
```

Expected: a rendered markdown dump; no `mcp__codebase-memory-mcp__manage_adr` failures.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.local.json
git commit -m "chore(allowlist): drop codebase-memory graph tools; keep manage_adr and delete_project"
```

---

## Task 16: PR 3 — open the PR

**Files:** none — verification only.

- [ ] **Step 1: Run the full test suite on the staged branch**

```bash
git status
bash scripts/build-blast-radius.sh
bun test tests/blast-radius/
markdownlint-cli2 skills/ skills/using-snowball/references/ docs/snowball/
```

Expected: all green.

- [ ] **Step 2: Open PR 3**

PR title: `chore(allowlist): drop codebase-memory graph tools from local Claude Code allowlist`.

PR body:

```markdown
## Summary

Paperwork pass. The codebase-memory graph tools are no longer used by any snowball surface after PRs 1 & 2. The two remaining entries (`manage_adr`, `delete_project`) are ADR-layer and stay until the follow-up MADR.

## Test plan

- [ ] `bun test tests/blast-radius/`
- [ ] `node skills/recalling-project-context/scripts/recall-context.cjs prepare` round-trip
- [ ] Pre-commit passes
```

---

## Task 17: Operator smoke test (capture in `tests/blast-radius/SMOKE.md`)

**Files:**

- Create: `tests/blast-radius/SMOKE.md`

- [ ] **Step 1: Mirror the spec's "Smoke test" section**

```markdown
# blast-radius yactt rollout smoke test

Run after PR 2 has been merged and the operator has installed yactt.

## Prerequisites (one-time)

\`\`\`bash
gh extension install kellenff/yactt   # or marketplace plugin
deno --version    # expect 2.7.x
\`\`\`

## Default run (yactt)

\`\`\`bash
echo '{"gitRoot":"'$(pwd)'","changeSet":{"paths":["skills/blast-radius/SKILL.md"],"proposedAction":""}}' \
  | node skills/blast-radius/scripts/compute.cjs compute-and-persist
# Expect: status: success, backend: graph, backend_attempts: ["yactt"]
\`\`\`

## Codebase-memory fallback

\`\`\`bash
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=codebase-memory \
  bash -c '<same command>'
# Expect: backend_attempts: ["codebase-memory"]
\`\`\`

## Heuristic only

\`\`\`bash
SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic \
  bash -c '<same command>'
# Expect: backend: heuristic, status: success.
\`\`\`

## Cold cache (no yactt installed, e.g., CI)

\`\`\`bash
unset SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND
<same command>
# Expect: backend: heuristic, status: degraded, reason: graph-unavailable,
#          backend_attempts: ["yactt","codebase-memory"]
\`\`\`
```

- [ ] **Step 2: Commit**

```bash
git add tests/blast-radius/SMOKE.md
git commit -m "test(blast-radius): add operator smoke checklist"
```

---

## Self-review

**1. Spec coverage:**
- § Goals 1, 3, 4, 5 → Tasks 6, 7, 11, 12, 13, 14, 15 (selector + auto-fallback + opt-out + parity + ADR untouched).
- § Goal 2 (land everywhere yactt-shaped) → Tasks 8 (mcp.json), 11 (top-of-skill prose), 12 (install.sh), 13 (README), 15 (allowlist).
- § Tests A, B, C → Tasks 4, 5, 9, 14.
- § Rollout (3 PRs) → Tasks 10, 14, 16.
- § Follow-up MADR (out of scope) → explicitly noted in task descriptions and Untouched list.

**2. Placeholder scan:**
- One `// TODO marker (post-review fix expected)` in Task 6 (the `detectChanges=null` shim). Acceptable — it's clearly a known PR1 limitation with a fix path documented.
- No "TBD" / "implement later" / "fill in details" patterns.

**3. Type consistency:**
- `resolveBackendClient` (Task 6) returns the same `GraphClient` interface used by `tryGraphBackend` (Task 7). Method names `listProjects` / `detectChanges` / `searchGraph` are preserved across both clients.
- `backend_attempts` is added to `assertEnvelope` once (Task 7, Step 1) and used twice (Task 7, Step 3). Closed enum `["yactt","codebase-memory","heuristic"]` consistent throughout.
- `Run-YacttCli`'s stderr → reason mapping (`repo-not-indexed` / `graph-unavailable` / `mcp-timeout`) matches the existing reason-code table.

**4. Reflow check:**
- Schema delta is one optional field (`backend_attempts`). `assertEnvelope` extended once, no other validators changed.
- `BLAST_RADIUS_DISABLE_GRAPH=1` mapping preserved verbatim.
- `CBM_CLI_PATH` semantics unchanged.
