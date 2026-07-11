// tests/blast-radius/yactt-cli/cli.test.ts
import { assertEquals } from "jsr:@std/assert@1"

const DENO_FLAGS = ["--allow-net", "--allow-read", "--allow-run", "--allow-write", "--allow-env"] as const

Deno.test("list-loaded-repos against stub returns parsed {repos:[...]}", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", ...DENO_FLAGS,
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

Deno.test("search-symbols returns the fixture shape", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", ...DENO_FLAGS,
      "extensions/snowball/yactt-cli/cli.ts",
      "search-symbols", "--repo", "/tmp/snowball-stub-1",
      "--query", "x", "--limit", "5"
    ],
    env: { YACTT_BIN: `${Deno.cwd()}/tests/blast-radius/yactt-cli/stub-server.ts` },
    stdout: "piped", stderr: "piped"
  })
  const { code, stdout, stderr } = await cmd.output()
  assertEquals(code, 0, `stderr: ${new TextDecoder().decode(stderr)}`)
  const parsed = JSON.parse(new TextDecoder().decode(stdout).trim())
  assertEquals(Array.isArray(parsed.results), true)
  assertEquals(parsed.results.length, 12)
})

Deno.test("missing --repo flag exits 2 with usage", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", ...DENO_FLAGS,
      "extensions/snowball/yactt-cli/cli.ts",
      "list-loaded-repos"
    ],
    stdout: "piped", stderr: "piped"
  })
  const { code, stderr } = await cmd.output()
  assertEquals(code, 2)
  const s = new TextDecoder().decode(stderr)
  if (!s.includes("usage:")) throw new Error(`expected usage error, got: ${s}`)
})

Deno.test("unknown subcommand exits 2", async () => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", ...DENO_FLAGS,
      "extensions/snowball/yactt-cli/cli.ts",
      "no-such-subcommand", "--repo", "/tmp/x"
    ],
    stdout: "piped", stderr: "piped"
  })
  const { code, stderr } = await cmd.output()
  assertEquals(code, 2)
  const s = new TextDecoder().decode(stderr)
  if (!s.includes("unknown subcommand")) throw new Error(`expected unknown error, got: ${s}`)
})
