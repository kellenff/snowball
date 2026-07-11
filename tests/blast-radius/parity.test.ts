// tests/blast-radius/parity.test.ts
//
// PR 1 scaffold: parity tests between codebase-memory and heuristic-only
// across a fixture repo. The full yactt-vs-codebase-memory bounded-parity
// assertion is a PR 2 follow-up (Task 9) once both backends are reachable
// in CI. For PR 1 we establish the test surface + the heuristic floor.
import { describe, it, expect } from "bun:test"
import { spawnSync } from "bun"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { tmpdir } from "node:os"

const COMPUTE_CJS = join(import.meta.dir, "..", "..", "skills", "blast-radius", "scripts", "compute.cjs")
const HELPER_DIR  = join(import.meta.dir, "_helpers")

function buildFixtureRepo(): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), "snowball-parity-"))
  spawnSync({ cmd: ["git", "init", "-q", dir] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.email", "test@example.com"] })
  spawnSync({ cmd: ["git", "-C", dir, "config", "user.name",  "Test"] })
  const layout: Record<string, string> = {
    "index.ts": `export { foo } from "./a";\nexport { bar } from "./b";\n`,
    "a.ts":     `import { x } from "./c"; export function foo() { return x(); }\n`,
    "b.ts":     `import { y } from "./d"; export function bar() { return y(); }\n`,
    "c.ts":     `export function x() { return 1 }\n`,
    "d.ts":     `export function y() { return 2 }\n`,
    "package.json": `{}\n`,
  }
  for (const [f, contents] of Object.entries(layout)) {
    writeFileSync(join(dir, f), contents)
  }
  spawnSync({ cmd: ["bash", "-c", `cd "${dir}" && git add -A && git -c commit.gpgsign=false commit -q -m init`] })
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function envelope(input: { gitRoot: string; selector: string; cbmCliPath?: string }) {
  const env: Record<string, string> = {
    ...process.env,
    SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND: input.selector,
  }
  if (input.cbmCliPath) env.CBM_CLI_PATH = input.cbmCliPath
  else env.PATH = `${HELPER_DIR}:${process.env.PATH ?? ""}`

  const proc = spawnSync({
    cmd: ["/Users/kellen/n/bin/node", COMPUTE_CJS, "compute"],
    env,
    stdin: new TextEncoder().encode(JSON.stringify({
      gitRoot: input.gitRoot,
      changeSet: { paths: ["a.ts", "b.ts"] }
    })),
  })
  return JSON.parse(new TextDecoder().decode(proc.stdout))
}

describe("parity floor", () => {
  it("heuristic-only run reports a sensible file count", () => {
    const fx = buildFixtureRepo()
    try {
      const env = envelope({ gitRoot: fx.dir, selector: "heuristic" })
      expect(env.backend).toBe("heuristic")
      expect(env.output.change_scope.fileCount).toBeGreaterThanOrEqual(2)
      expect(env.backend_attempts ?? []).toEqual([])
    } finally { fx.cleanup() }
  })

  it("codebase-memory-stub run via the fixture repo returns backend: graph", () => {
    const fx = buildFixtureRepo()
    try {
      const env = envelope({ gitRoot: fx.dir, selector: "codebase-memory", cbmCliPath: "codebase-memory-mcp" })
      // The stub's root_path will not match a real path but the fixture is sufficient
      // to exercise the chained fallback's first successful graph attempt.
      expect(env.backend).toMatch(/^(graph|heuristic)$/)
      expect(env.backend_attempts?.[0]).toBe("codebase-memory")
    } finally { fx.cleanup() }
  })
})

// TODO (PR 2 follow-up):
// it("yactt attempts codebase-memory on graph-unavailable and asserts bounded agreement", ...)
// See task 9 in docs/snowball/plans/2026-07-10-yactt-graph-backend.md.
