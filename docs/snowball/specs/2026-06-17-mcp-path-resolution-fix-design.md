# MCP Path-Resolution Fix for Marketplace Install

**Date:** 2026-06-17
**Status:** Accepted (post-brainstorm, pending user review of the written spec)
**Scope:** Replace the `<absolute-path-to-snowball>` placeholder in `extensions/snowball/mcp/mcp.json` with a runtime-resolution scheme that works across marketplace, clone-and-point, and future install surfaces
**Depends on:** v6.3.0 Junie support ([2026-06-16-junie-support-design.md](./2026-06-16-junie-support-design.md)) and the Junie CLI marketplace entry ([2026-06-16-junie-cli-marketplace-design.md](./2026-06-16-junie-cli-marketplace-design.md)) already shipped
**Supersedes:** Open Question 2 of the marketplace design (the MCP-path placeholder, deferred there)
**Related:** [2026-06-16-junie-cli-marketplace-design.md](./2026-06-16-junie-cli-marketplace-design.md) (the marketplace spec this unblocks); [2026-06-16-junie-support-design.md](./2026-06-16-junie-support-design.md) (original Junie-support spec that called out the IDE-plugin placeholder)

## Problem

`extensions/snowball/mcp/mcp.json` carries a `<absolute-path-to-snowball>` placeholder in the `snowball-capture` server's `args`:

```json
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs"]
    },
    "argdown": { /* unchanged */ },
    "codebase-memory": { /* unchanged */ }
  }
}
```

For the **clone-and-point (JetBrains IDE plugin)** install, the placeholder has a meaningful replacement — the user knows where they cloned the repo, and the IDE-plugin docs walk them through the substitution. For the **marketplace (Junie CLI)** install, the bundle lives at `~/.junie/extensions/<marketplace-id>/snowball/`, a path the user has no reason to know and the placeholder doesn't carry. The server fails to start until the user hand-edits the config after install — a broken UX.

The placeholder also covers only paths the user knows. Once the bundle can land in three or more places (marketplace, clone, future project-local, future JAR-packaged), keeping the resolution logic in user-rewritten config strings is unsustainable. The right shape is: the path is resolved at server-start time by code that knows where the bundle lives, not by the user.

The marketplace spec deferred this to a follow-up ("Open Question 2"). This is that follow-up.

## Goals

1. After a marketplace install, `snowball-capture` starts without manual config edits, on Junie CLI.
2. The clone-and-point (JetBrains IDE plugin) install keeps working — no behavior regression for users who already hand-edited the config.
3. The resolution is path-agnostic: any future install surface (project-local, JAR-packaged, etc.) works without revisiting this design.
4. Stay small: three new files, no installer coupling, no per-adapter code.
5. Be testable in isolation: the path-resolution function is pure (no fs writes, no subprocess), so the unit test exercises the strategy without a fake MCP transport.

## Non-Goals

- **Fixing `argdown` and `codebase-memory` placeholder paths.** These are external user-installed MCP servers. Their paths necessarily come from the user; there's no bundled location to resolve against. Out of scope; documented as a known limitation.
- **Adopting a vendor-specific config templating mechanism** (Junie's installer hooks, Cursor's env-var conventions, etc.). The fix is adapter-agnostic on purpose.
- **Changing the existing clone-and-point install path's behavior.** Users who already hand-edited the config keep their working setup; the fix layers on top.
- **Bumping the project version.** This is feature-additive under v6.3.0; the marketplace spec already shipped under the same release. The README/RELEASE-NOTES note covers user-visible change.
- **A full adapter-resolution survey.** The chorus pragmatically flagged one ("run a 4-case survey across all 7+ adapters before committing to a design"), but the wrapper-plus-script hybrid handles all known resolution modes by construction. The survey is useful future work; this spec doesn't block on it.
- **A generic `extensions/snowball/scripts/` runner for post-install hooks.** The install script is specific to the MCP-path rewrite; a generic runner is YAGNI.

## Architecture

Three surfaces, one shared pure function:

```text
extensions/snowball/
  snowball-capture/
    dist/server.cjs          ← the real MCP server (unchanged)
    run.cjs                  ← NEW: thin wrapper, the only thing mcp.json points at
    resolve-bundle-path.cjs  ← NEW: pure resolver, no side effects
  scripts/
    install-path-fix.cjs     ← NEW: post-install rewriter (cross-platform)
  mcp/
    mcp.json                 ← args[0] becomes "../snowball-capture/run.cjs"
```

The resolver is the unit of truth — one definition, testable in isolation, no fork-on-startup cost. The wrapper and the install script are thin shells that delegate to it. If the strategy is wrong, it's wrong in one place and easy to fix.

### Components

#### `resolve-bundle-path.cjs` (the pure unit)

A pure function: no fs writes, no subprocess, no global state. Takes `{ env, dirname }` (the env var value and the wrapper's `__dirname`); returns `{ path, source }` where `path` is the absolute path to `dist/server.cjs` and `source` is which hint won. Throws `BundlePathNotFoundError` when neither hint resolves.

```js
function resolveBundlePath(hints, options = {}) {
  const { checkExists = true } = options;

  // 1. Try SNOWBALL_BUNDLE_DIR (bundle root → <root>/snowball-capture/dist/server.cjs)
  if (hints.env) {
    const candidate = path.join(hints.env, 'snowball-capture/dist/server.cjs');
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: 'env' };
    }
  }

  // 2. Fall back to dirname (wrapper's directory → <dirname>/dist/server.cjs)
  if (hints.dirname) {
    const candidate = path.join(hints.dirname, 'dist/server.cjs');
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: 'dirname' };
    }
  }

  throw new BundlePathNotFoundError('Cannot resolve snowball-capture server', { hints });
}
```

Why `checkExists` is opt-out, not opt-in: in production we always want a real file check (otherwise the wrapper would surface a confusing spawn-ENOENT later). In unit tests we want `false` to avoid setting up fs fixtures for every pure-function case.

The error class is exported from the same module so the wrapper and the install script can `instanceof`-check and render it consistently:

```js
class BundlePathNotFoundError extends Error {
  constructor(message, { hints }) {
    super(message);
    this.name = 'BundlePathNotFoundError';
    this.hints = hints;
  }
}
```

#### `run.cjs` (the wrapper, ~30 lines)

The MCP config points at this. Reads its own location, calls the resolver, forks Node with the resolved absolute path, forwards signals, exits with the child's exit code. No path logic of its own — it asks the resolver.

```js
#!/usr/bin/env node
const { spawn } = require('child_process');
const { resolveBundlePath, BundlePathNotFoundError } = require('./resolve-bundle-path.cjs');

let resolved;
try {
  resolved = resolveBundlePath({
    env: process.env.SNOWBALL_BUNDLE_DIR,
    dirname: __dirname,
  });
} catch (err) {
  if (err instanceof BundlePathNotFoundError) {
    process.stderr.write(`snowball-capture: cannot locate dist/server.cjs\n`);
    process.stderr.write(`  tried SNOWBALL_BUNDLE_DIR=${err.hints.env || '<unset>'}\n`);
    process.stderr.write(`  tried dirname=${err.hints.dirname || '<unset>'}\n`);
    process.exit(1);
  }
  throw err;
}

const child = spawn(process.execPath, [resolved.path, ...process.argv.slice(2)], {
  stdio: 'inherit',
  env: process.env,
});

// Forward signals the loader sends us.
for (const sig of ['SIGTERM', 'SIGINT', 'SIGHUP']) {
  process.on(sig, () => { try { child.kill(sig); } catch {} });
}

// Mirror child's exit (signal or code) so the loader sees the real outcome.
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
```

**Why `process.execPath` and not `node` in the args:** the wrapper is launched by `node run.cjs`, so `process.execPath` resolves to the same Node binary the user already has on PATH. Using the literal `node` would re-enter PATH resolution and could pick a different version.

**Why stdio inherit:** the MCP transport is line-delimited JSON over stdio. Anything but `inherit` breaks the protocol.

**Why the signal-forwarding loop:** `process.on(sig)` is idempotent per signal; registering the same signal three times would log a Node warning. The loop is safe because we register exactly one handler per signal.

#### `install-path-fix.cjs` (the post-install rewriter, ~50 lines)

User-invoked once after marketplace install (and on every bundle-path change). Cross-platform (Node.js so it ships everywhere Node ships). Calls the same resolver — never duplicates the path logic. Rewrites `mcp/mcp.json` with the absolute path to `run.cjs` so adapters that don't resolve relative paths still find the wrapper.

```js
#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const { resolveBundlePath, BundlePathNotFoundError } = require('../snowball-capture/resolve-bundle-path.cjs');

const bundleRoot = path.join(__dirname, '..');
const configPath = path.join(bundleRoot, 'mcp', 'mcp.json');

if (!fs.existsSync(configPath)) {
  process.stderr.write(`snowball install-path-fix: cannot find ${configPath}\n`);
  process.stderr.write(`  expected: extensions/snowball/scripts/install-path-fix.cjs\n`);
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const wrapperPath = path.join(bundleRoot, 'snowball-capture', 'run.cjs');

config.mcpServers['snowball-capture'] = {
  command: 'node',
  args: [wrapperPath],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
process.stdout.write(`snowball install-path-fix: rewrote ${configPath}\n`);
process.stdout.write(`  snowball-capture → ${wrapperPath}\n`);
```

The wrapper itself still does its own resolution (to find `dist/server.cjs`). The install script's job is narrower: it resolves *the wrapper's location* for adapters that can't follow a relative path. Both surfaces call the same resolver so the "what does the bundle path look like" logic has one definition.

#### `mcp/mcp.json` (updated)

```json
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["../snowball-capture/run.cjs"]
    },
    "argdown": { /* unchanged */ },
    "codebase-memory": { /* unchanged */ }
  }
}
```

The relative path is resolved against the config file's directory by Junie's loader. For Junie CLI and any other adapter that does config-dir-relative resolution, this Just Works without the install script. For adapters that resolve against CWD, the user runs the install script (or sets `SNOWBALL_BUNDLE_DIR` in their per-server env block, if their adapter supports that).

### Data flow

| Install surface | Adapter behavior | Path to wrapper | Resolver source |
|---|---|---|---|
| Marketplace (Junie CLI) | relative-path resolution | `node ../snowball-capture/run.cjs` | `__dirname` |
| Marketplace + run install script | any | `node <absolute>/run.cjs` | `__dirname` |
| Clone-and-point (JetBrains IDE) | relative-path resolution | `node ../snowball-capture/run.cjs` | `__dirname` |
| Clone-and-point + run install script | any | `node <absolute>/run.cjs` | `__dirname` |
| Any + user sets `SNOWBALL_BUNDLE_DIR` | any | `node <whatever>/run.cjs` | `env` |

The wrapper is always the same; only the path the adapter needs to spawn it changes. That's the whole point — the resolution of *the wrapper's location* is the adapter's problem (and the install script's job when needed); the resolution of *the server's location relative to the wrapper* is always `__dirname`.

The wrapper also reads `SNOWBALL_BUNDLE_DIR` if it's set in the spawned process's environment. Adapters that let users configure per-server env vars (Cursor, Claude Code, OpenCode, Gemini CLI) get an escape hatch for CWD-resolving cases without invoking the install script.

### Error handling

| Failure | Surface | Behavior |
|---|---|---|
| `dist/server.cjs` not found via either hint | resolver | Throws `BundlePathNotFoundError` with `{ hints }` payload |
| Resolver throws inside wrapper | `run.cjs` | Catches, prints message + payload to stderr, exits 1 |
| Resolver throws inside install script | `install-path-fix.cjs` | Catches, prints message + payload to stderr, exits 1 |
| Wrapper's child crashes | `run.cjs` | Mirrors child's exit code via `child.on('exit')` |
| Wrapper gets `SIGTERM/SIGINT/SIGHUP` from parent loader | `run.cjs` | Forwards to child, waits for child's exit, re-raises to exit with the same signal |
| Child dies by signal | `run.cjs` | Wrapper re-raises the signal so the loader sees the real cause |
| `mcp.json` not found | install script | Exits 1 with "expected at extensions/snowball/mcp/mcp.json" |
| `mcp.json` malformed JSON | install script | Exits 1 with the parse error |
| User runs install script twice | install script | Idempotent — same output, no diff |

The wrapper doesn't try to be clever about retries or fallback beyond env-then-dirname. The resolver is the one place where the strategy lives.

The signal-forwarding story is the load-bearing detail. A naive `child.kill(); process.exit()` races — the parent process exits before the child has a chance to flush stdio, and the loader logs an orphaned-child error that looks like a server bug, not a path bug. The wrapper's lifetime must equal the inner server's lifetime; the only safe shape is signal-forward + wait-for-child + exit-with-child-code.

## Testing

Per project convention (`tests/junie-cli/validate-marketplace.sh` is stdlib-only bash), the new tests are bash too. Each test creates a temp-dir fixture and runs against real binaries — no mocking layer.

### `tests/junie-cli/test-resolve-bundle-path.sh`

Pure unit tests via Node's `assert` and `--check-exists=false` for the matrix:

- `SNOWBALL_BUNDLE_DIR` set + valid → returns env path, source `'env'`.
- `SNOWBALL_BUNDLE_DIR` set + path missing → falls back to dirname (with `checkExists: true`).
- `SNOWBALL_BUNDLE_DIR` unset → returns dirname path, source `'dirname'`.
- Both missing → throws `BundlePathNotFoundError` with `hints` payload (asserted via Node's stderr capture).
- `SNOWBALL_BUNDLE_DIR` empty string → treated as unset (regression test for env-var mishandling).
- `dirname` not a string → throws (input-shape guard).

Each case is a few lines of bash that runs `node -e "..."` against the resolver. Total runtime under one second.

### `tests/junie-cli/test-run-wrapper.sh`

Collaboration test:

- Fixture: copy `run.cjs` + `resolve-bundle-path.cjs` + a fake `dist/server.cjs` (a 5-line `console.log` + `process.exit(0)` script) into a temp dir.
- Assert: spawning `node run.cjs` produces the expected stdout and exits 0.
- Assert: `SNOWBALL_BUNDLE_DIR` override changes the resolution source.
- Assert: spawning with the wrapper pointed at a non-existent `dist/server.cjs` exits 1 with the expected error message.

### `tests/junie-cli/test-run-wrapper-signals.sh`

Signal-forwarding test (the regression the chorus pragmatist flagged as load-bearing):

- Fixture: fake `dist/server.cjs` installs a `SIGTERM` handler that writes a marker file (`$TMPDIR/snowball-test-marker`) and exits 0.
- Start the wrapper in the background.
- Send `SIGTERM` to the wrapper's PID.
- Wait for the wrapper to exit.
- Assert: marker file exists (child got the signal), wrapper exit code matches child's exit code (0, not `128+15`).

Without this test, the orphan-after-SIGTERM regression would ship silently.

### `tests/junie-cli/test-install-path-fix.sh`

Collaboration test:

- Fixture: copy the bundle layout (`extensions/snowball/{snowball-capture,mcp}/`) into a temp dir.
- Run `install-path-fix.cjs`.
- Assert: `mcp.json` now has `args[0]` pointing at an absolute path to `run.cjs`.
- Run again (idempotence): same output, no diff.
- Assert: the rewritten config parses and the path inside it actually exists.
- Assert: missing `mcp.json` produces the expected "expected at extensions/snowball/mcp/mcp.json" stderr and exits 1.

### Integration with the existing pre-commit pipeline

Add the four new test files to `.pre-commit-config.yaml` under the existing shellcheck/test repos, alongside `tests/junie-cli/validate-marketplace.sh`. No new CI workflow; the existing `.github/workflows/` jobs already run pre-commit.

### Existing tests that must keep passing

- `tests/junie-cli/validate-marketplace.sh` — the marketplace wiring check, unchanged by this spec.
- `tests/claude-code/` — no overlap; pre-commit runs all of them.
- `tests/gitlab-duo/` — same.
- `tests/snowball-capture/` — the MCP server's own tests; unaffected.
- The `pre-commit-config.yaml` shellcheck, oxlint, oxfmt, shfmt, markdownlint — all run on the new files.

### What's deliberately not tested

- The wrapper against a real Junie install (requires Junie + auth + non-CI).
- The signal-forwarding test under Node's `cluster` or `worker_threads` — out of scope; this fix doesn't use either.
- The install script's behavior when `mcp.json` doesn't exist at all — covered by the explicit "Exits 1 with expected layout" branch and asserted in the negative test.

## Decisions (locked during brainstorming, 2026-06-17)

| Decision | Outcome |
| --- | --- |
| Scope of "MCP path fix" | Replace the placeholder with a runtime-resolution scheme (not a post-install substitution step the user does by hand) |
| Install surfaces in scope | All known paths (marketplace + clone-and-point) plus any future path — explicitly path-agnostic |
| Approach | Hybrid: pure wrapper + user-invoked install script, sharing one resolver |
| Second-model brain-jam | Skipped; user asked for `chorus` (not `m2`) instead — chorus surfaced six angles that shaped Approach 2 |
| Resolver location | Separate file (`resolve-bundle-path.cjs`), pure function, exported error class |
| Wrapper location | `snowball-capture/run.cjs`, sibling to the bundled `dist/server.cjs` |
| Install script location | `scripts/install-path-fix.cjs`, cross-platform Node.js |
| Install script runtime | Node.js (not bash) so Windows is covered without a second implementation |
| Env-var mechanism | Ship `SNOWBALL_BUNDLE_DIR` as documented escape hatch for adapters that support per-server env |
| Wrapper signal handling | Full SIGTERM/SIGINT/SIGHUP forwarding + wait-for-child + exit-with-child-code |
| Adapter-resolution survey | Deferred — not blocking this spec; the hybrid handles all known modes by construction |
| Marketplace spec update | Open Question 2 in the marketplace spec gets marked resolved and points at this spec |
| Version bump | No (feature-additive under v6.3.0) |

## Concrete edits

### 1. New file: `extensions/snowball/snowball-capture/resolve-bundle-path.cjs`

The pure resolver and the `BundlePathNotFoundError` class, as shown in the Components section above.

### 2. New file: `extensions/snowball/snowball-capture/run.cjs`

The wrapper, as shown in the Components section above. Make it executable (`chmod +x`).

### 3. New file: `extensions/snowball/scripts/install-path-fix.cjs`

The post-install rewriter, as shown in the Components section above. Make it executable.

### 4. Edit: `extensions/snowball/mcp/mcp.json`

Change `args[0]` from `"<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs"` to `"../snowball-capture/run.cjs"`. No other changes.

### 5. New file: `tests/junie-cli/test-resolve-bundle-path.sh`

Stdlib-only bash, six pure-function cases, runs against the real resolver via `node -e`.

### 6. New file: `tests/junie-cli/test-run-wrapper.sh`

Stdlib-only bash, three collaboration cases against a temp-dir fixture.

### 7. New file: `tests/junie-cli/test-run-wrapper-signals.sh`

Stdlib-only bash, signal-forwarding test with a fixture server that traps SIGTERM and writes a marker file.

### 8. New file: `tests/junie-cli/test-install-path-fix.sh`

Stdlib-only bash, four cases including idempotence and the negative missing-`mcp.json` test.

### 9. Edit: `.pre-commit-config.yaml`

Add a hook entry for the four new test files under the existing test repos, alongside `tests/junie-cli/validate-marketplace.sh`.

### 10. Edit: `docs/snowball/specs/2026-06-16-junie-cli-marketplace-design.md`

- In the "Open questions" section, mark Open Question 2 as resolved and link to this spec.
- In the "Known limitations" section, remove the "MCP server paths require a one-time fix after install" bullet.

### 11. Edit: `README.md`

In the "What is different from upstream" changelog table, under the v6.3.0 row, append a one-line sub-bullet noting the placeholder fix: "MCP path-resolution fix: `mcp/mcp.json` now uses a runtime-resolution wrapper; works after marketplace install without manual path edits."

### 12. Edit: `RELEASE-NOTES.md`

Under the existing v6.3.0 section, add a sub-bullet:

```markdown
- **MCP path-resolution fix** — `extensions/snowball/mcp/mcp.json` no longer carries a `<absolute-path-to-snowball>` placeholder. A new `run.cjs` wrapper around `snowball-capture` resolves the server's path at start time from `SNOWBALL_BUNDLE_DIR` or its own `__dirname`; an optional `scripts/install-path-fix.cjs` rewrites the config with absolute paths for adapters that don't resolve relative paths. Works after marketplace install without manual path edits.
```

## Manual verification

The only end-to-end check that exercises real Junie CLI. Run on a developer machine with Junie CLI installed and authenticated. Reuses the manual verification path from the marketplace spec; only steps 5 (MCP active) and 9 (negative test) change.

1. **Register the marketplace** — `/extensions marketplace add ./` (local-dir form) or `/extensions marketplace add https://github.com/kellenff/snowball`.
2. **List the catalog** — `/extensions` shows `snowball` under the registered marketplace.
3. **Install the extension** — `/extensions install snowball`. Confirm the install completes without errors.
4. **Verify content cached** — list `~/.junie/extensions/<marketplace-id>/snowball/`. Confirm `extension.json`, `skills/`, `.junie/AGENTS.md`, `mcp/mcp.json`, and `snowball-capture/` (including the new `run.cjs` and `resolve-bundle-path.cjs`) are present.
5. **Verify MCP servers are Active** — `/mcp` shows `snowball-capture`, `argdown`, and `codebase-memory` all `Active`. (No manual path edit.)
6. **Verify the install script is a no-op** — run `node ~/.junie/extensions/<marketplace-id>/snowball/extensions/snowball/scripts/install-path-fix.cjs` twice in a row. Confirm the second run produces no diff (idempotence).
7. **Verify the install script fixes a hypothetical CWD-resolving adapter** — temporarily edit `mcp.json` to use a relative path that the wrapper can't find, run the install script, confirm the rewrite replaces it with an absolute path, and confirm `/mcp` still shows `snowball-capture` Active. Restore `mcp.json` after.
8. **Verify signal handling** — start a Junie session, send `SIGTERM` to the snowball-capture child via `kill`, confirm Junie logs the server shutting down cleanly (no orphan error, no error exit code).
9. **Verify bootstrap injection and skills reachability** — same as the marketplace spec: start `/new`, confirm `using-snowball` is in context, ask the agent to use `brainstorming`, confirm a MADR file appears under `docs/snowball/decisions/`.

## Open questions

**1. Adapter-resolution survey.** A 4-case survey (relative path / absolute path / symlink / env-var-when-supported) across all 7+ adapters (Junie CLI, JetBrains IDE plugin, Claude Code, Cursor, Codex CLI, Copilot CLI, GitLab Duo, OpenCode, Gemini CLI) would confirm the wrapper-plus-install-script hybrid handles every case correctly and surface any adapter that needs a second escape hatch. Deferred — the wrapper-plus-script hybrid handles all known modes by construction, and the env-var fallback covers the long tail. Re-open if a real adapter fails.

**2. JetBrains IDE plugin packaging.** Once packaged into a JAR, `mcp/mcp.json` may not exist on disk; `__dirname` resolves to a JAR-internal path that Node's `require()` follows via classloader but `__dirname` reads as a string. The fix doesn't address JAR packaging directly, but the wrapper's `__dirname` strategy depends on it. If the IDE-plugin path is ever repackaged as a JAR, this design needs revisiting. Documented here for the future maintainer; no change in this spec.

**3. `SNOWBALL_BUNDLE_DIR` semantics.** The env var points at the bundle root (the directory that contains `snowball-capture/`), not at the wrapper's directory. This is intentional — the bundle root is the only stable identifier across install surfaces; the wrapper's directory is derivable from it. Documented in the env-var section of the README so users setting it manually don't get it wrong.

## Known limitations

- **`argdown` and `codebase-memory` paths still require user setup.** These are external MCP servers the user installs separately; their `args` carry `<absolute-path-to-*>` placeholders that only the user can fill in. Same limitation as before this spec; not addressed here. Documented in the original Junie-support spec.
- **Marketplace install + CWD-resolving adapter = one user action.** The marketplace install is now drag-and-drop for Junie CLI. For adapters that don't resolve relative paths (the long tail), the user runs `node extensions/snowball/scripts/install-path-fix.cjs` once after install. This is the only remaining manual step in the marketplace path; it's documented in the README.
- **Wrapper's `__dirname` is moot under JAR packaging.** See Open Question 2. Not addressed in this spec because the JAR packaging scenario isn't on the immediate roadmap.
