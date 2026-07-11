// tests/blast-radius/compute.test.ts
//
// Contract tests for the blast-radius backend selector and chained fallback.
// Uses bun:test; the helpers live in tests/blast-radius/_helpers/.
import { describe, it, expect } from "bun:test"
import { spawnSync } from "bun"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
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
      cmd: ["/Users/kellen/n/bin/node", COMPUTE_CJS, "compute-and-persist"],
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
  it("explicit codebase-memory selector produces backend: graph", () => {
    const { envelope } = runCompute({
      PATH: `${HELPER_DIR}:${process.env.PATH ?? ""}`,
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "codebase-memory"
    })
    expect(envelope.backend).toBe("graph")
    expect(envelope.backend_attempts).toEqual(["codebase-memory"])
    expect(envelope.status).toBe("success")
  })

  it("explicit heuristic selector produces backend: heuristic", () => {
    const { envelope } = runCompute({
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "heuristic"
    })
    expect(envelope.backend).toBe("heuristic")
    expect(envelope.backend_attempts ?? []).toEqual([])
  })

  it("BLAST_RADIUS_DISABLE_GRAPH=1 maps to SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND=heuristic (backward compat)", () => {
    const r1 = runCompute({ BLAST_RADIUS_DISABLE_GRAPH: "1" }).envelope
    const r2 = runCompute({ SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "heuristic" }).envelope
    expect(r1.backend).toBe(r2.backend)
    expect(r1.status).toBe(r2.status)
  })

  it("CBM_CLI_PATH redirects the codebase-memory binary (backward compat)", () => {
    const { envelope } = runCompute({
      PATH: HELPER_DIR,
      SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: "codebase-memory",
      CBM_CLI_PATH: "codebase-memory-mcp-stub.sh"
    })
    expect(envelope.backend).toBe("graph")
    expect(envelope.backend_attempts).toEqual(["codebase-memory"])
  })

  it("default selector (env unset) attempts yactt first; falls through to codebase-memory", () => {
    const { envelope } = runCompute({
      PATH: HELPER_DIR,
      // YACTT_BIN points to a path that doesn't exist; yactt attempt fails graph-unavailable.
      // Auto-fallback to codebase-memory succeeds via the stub.
      YACTT_BIN: "/nonexistent/yactt-binary"
    })
    // Auto-fallback chain: yactt (graph-unavailable) → codebase-memory (graph:success)
    expect(envelope.backend).toBe("graph")
    expect(envelope.backend_attempts).toEqual(["yactt", "codebase-memory"])
  })
})
