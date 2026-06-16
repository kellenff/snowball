# Junie CLI Marketplace Entry

**Date:** 2026-06-16
**Status:** Accepted (post-brainstorm, pending user review of the written spec)
**Scope:** Add an explicit Junie CLI marketplace entry that wraps the existing `extensions/snowball/` bundle; one small file rename inside the bundle to match Junie's canonical MCP filename
**Depends on:** v6.3.0 Junie support ([2026-06-16-junie-support-design.md](./2026-06-16-junie-support-design.md)) already shipped
**Supersedes:** nothing
**Related:** [2026-06-07-chorus-companion-design.md](./2026-06-07-chorus-companion-design.md) (companion-skill precedent for "wrap an existing capability behind a Junie-recognized surface")

## Problem

Snowball v6.3.0 added first-class Junie support for the **JetBrains IDE plugin** — the `extensions/snowball/` bundle (skills + `.junie/AGENTS.md` + `snowball-capture` MCP) is installable inside a JetBrains IDE. But the **Junie CLI** — the terminal-based agentic coding tool at `junie.jetbrains.com/cli` — discovers extensions through a marketplace manifest, not through a manually-pointed local directory. The repo has no such manifest.

Concretely: today, a Junie CLI user who wants to run snowball cannot run `/extensions marketplace add` followed by `/extensions install snowball` because there is no marketplace to register. They would have to know the internal layout, clone the repo, point Junie at `extensions/snowball/`, and accept the IDE-plugin conventions manually. This is below the "explicit" bar the user asked for.

The fix is narrow: a single new marketplace file at the repo root that lists the existing bundle, plus one file rename inside the bundle to align with Junie's canonical MCP filename, plus a lightweight validation test. The bundle itself is already in the standard Junie layout — this work does not redesign it.

## Goals

1. Ship a discoverable Junie CLI marketplace entry: `/extensions marketplace add https://github.com/kellenff/snowball` works and the `snowball` extension appears in the catalog.
2. `/extensions install snowball` works against the registered marketplace and produces a working install: skills reachable, AGENTS.md injected, `snowball-capture` / `argdown` / `codebase-memory` MCP servers `Active`.
3. Reuse the existing `extensions/snowball/extension.json` as the authoritative extension manifest; the new marketplace file is a thin list of pointers.
4. Align the bundle's MCP filename with Junie's canonical convention (`mcp/mcp.json`, not `mcp/.mcp.json`).
5. Add a small validation test that runs in pre-commit and CI; fail loud if the marketplace wiring breaks.
6. Update README and RELEASE-NOTES to reflect the new discoverable surface.

## Non-Goals

- **Restructuring the existing extension bundle into a new shape.** The current `extensions/snowball/` layout (extension.json at the root, skills/, .junie/AGENTS.md, mcp/, snowball-capture/) is already the standard Junie layout. The marketplace only needs a wrapper.
- **A new install script (`install-into-project-junie.sh` in the style of the GitLab Duo installer).** The marketplace path makes the script unnecessary for Junie CLI. A project-local install script can come later if a different use case appears.
- **Multi-extension support in the marketplace schema.** The marketplace is structured to hold a list, but only one entry ships today. Speculative multi-extension structure is YAGNI; refactor when a second bundle exists.
- **Schema-level JSON Schema validation for the marketplace.** Junie does not publish a schema. The validation test asserts the shape by hand; that's enough for a four-field manifest.
- **End-to-end automation of `/extensions install` in CI.** Requires a real Junie install, model auth, and a non-CI environment. Documented as a manual smoke test.
- **Manifest version bump for the project.** This change is feature-additive under v6.3.0; README tracks Junie features independently of `package.json` / plugin manifests (per the same precedent the original Junie-support design followed).
- **A new "Junie CLI" row in the per-harness adapters table.** The existing row already says "Junie (JetBrains IDE plugin)" and points at `extensions/snowball/`. The CLI marketplace is the same bundle, just with a new discovery surface. The row gets a small annotation rather than a new row.

## Junie's marketplace surface (what the design assumes)

Verified against the Junie CLI docs (the `junie-cli-docs` skill, version 1966.53):

- **Two manifest formats** — `.junie-extension/marketplace.json` (native) or `.claude-plugin/marketplace.json` (Claude-compatible). This design ships the native format only; the Claude-compatible format is already present in the repo and serves Claude Code.
- **Marketplace source** — git repo (default shorthand `owner/repo`), local directory, or direct URL. GitHub repos resolve cleanly via `github.com/owner/repo`.
- **Marketplace entry** — a list of extensions, each with at minimum `name` and `source`. Junie follows `source` relative to the marketplace file's directory and expects to find an `extension.json` there.
- **Extension content layout** — `<source>/extension.json` (manifest), `skills/`, `.junie/AGENTS.md` (project guidelines), `mcp/mcp.json` (MCP server definitions). Junie docs only show `mcp.json` (no leading dot); the rename aligns the bundle with the documented convention.
- **User-level vs project-level install** — `/extensions install <name>` writes a reference into `~/.junie/extensions/extensions.json`; extension content is cached under `~/.junie/extensions/<marketplace-id>/<extension>/`. No files are written into the user's project by the install itself.

## Design

### Architecture

```text
snowball repo
├── .junie-extension/                       NEW
│   └── marketplace.json                    wraps the extension entry
├── .claude-plugin/                         untouched (Claude Code marketplace)
├── extensions/
│   └── snowball/                           existing bundle, mostly untouched
│       ├── extension.json                  ENRICHED with full metadata
│       ├── .junie/AGENTS.md                untouched
│       ├── skills/                         untouched
│       ├── mcp/
│       │   ├── .mcp.json                   REMOVED
│       │   └── mcp.json                    NEW (renamed, content identical)
│       └── snowball-capture/               untouched
└── tests/junie-cli/                        NEW (lightweight JSON validation)
```

**Why thin marketplace, rich extension.json:** mirrors how `.claude-plugin/plugin.json` already carries metadata in this repo. The marketplace is a list of pointers; the manifests at the pointed-to paths are authoritative. One place to keep metadata per extension, not two.

**Why the MCP rename:** Junie CLI discovers extension MCP configs at `mcp/mcp.json` (or `.mcp.json` — both tolerated per the docs, but `mcp.json` is the canonical path the JetBrains example uses and the path the `~/.junie/mcp/mcp.json` standard maps to). Renaming aligns the bundle with the convention the rest of the ecosystem uses.

**Why no version bump:** feature-additive under v6.3.0. Junie is the same bundle; only the discovery surface changed. README's "What is different from upstream" table already has a v6.3.0 row; the new marketplace is a follow-up note under the same release, not a new release of its own.

### Components

#### `/.junie-extension/marketplace.json` (new)

Thin wrapper listing one extension. The marketplace carries only discovery-level metadata (name, description, owner, homepage, repository, license) plus the `extensions[]` list. The pointed-to `extension.json` carries the per-extension metadata.

```json
{
  "name": "snowball",
  "description": "Snowball: agentic skills that remember why. Decision-intelligent skills library with forward spine (TDD, debugging, collaboration) and decision spine (passive MADR capture).",
  "owner": {
    "name": "Kellen Frodelius-Fujimoto",
    "email": "kellen@kellenfujimoto.com"
  },
  "homepage": "https://github.com/kellenff/snowball",
  "repository": "https://github.com/kellenff/snowball",
  "license": "MIT",
  "extensions": [
    {
      "name": "snowball",
      "source": "./extensions/snowball",
      "description": "Snowball skills library: forward spine + snowball-capture MCP for decision spine"
    }
  ]
}
```

Notes on field choices:

- **Marketplace name = extension name = `snowball`.** Junie's user-level `extensions.json` keys marketplace entries by `<source>-<id>`, so the user sees `snowball/snowball` once installed. Acceptable for a one-extension marketplace. A rename to a more general `snowball-extensions` is a future change if more bundles ship.
- **`source: "./extensions/snowball"`** is a relative path that Junie resolves from the marketplace file's parent directory. The leading `./` is conventional; both forms are tolerated.
- **No `version` at the marketplace level.** The pointed-to `extension.json` carries the version; the marketplace is a list of pointers, not a versioned catalog.

#### `/extensions/snowball/extension.json` (enriched)

The current `extension.json` is six lines and carries only `name` / `version` / `description`. It gets enriched with the metadata that the Claude Code `plugin.json` already carries (author, homepage, repository, license, keywords), so the extension is self-describing for any consumer — Junie, JetBrains Marketplace, or a future installer.

```json
{
  "name": "snowball",
  "version": "6.3.0",
  "description": "Snowball skills library: agentic skills that remember why. Loads as agent context in Junie; decision-spine capture via the bundled snowball-capture MCP server.",
  "author": {
    "name": "Kellen Frodelius-Fujimoto",
    "email": "kellen@kellenfujimoto.com"
  },
  "homepage": "https://github.com/kellenff/snowball",
  "repository": "https://github.com/kellenff/snowball",
  "license": "MIT",
  "keywords": [
    "skills",
    "tdd",
    "debugging",
    "collaboration",
    "decision-logging",
    "madr"
  ]
}
```

Notes on field choices:

- **Version bumped to `6.3.0`** to match the rest of the repo. The current value (`0.1.0`) is inconsistent with `RELEASE-NOTES.md`, `package.json`, `.claude-plugin/plugin.json`, and `.cursor-plugin/plugin.json`. The bump is a metadata fix, not a release boundary.
- **`description` is the long form**, not the short one. Junie's extension catalog displays the extension description; the longer one is more useful at discovery time.

#### `/extensions/snowball/mcp/mcp.json` (renamed)

Identical content to the existing `mcp/.mcp.json`, just under the canonical filename. No content change.

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

### Data flow

End-to-end install flow once the marketplace ships:

```text
USER (terminal, in any project)
  $ junie
  Junie CLI vX.Y.Z
  >

  > /extensions marketplace add https://github.com/kellenff/snowball
  # Junie clones the repo, reads .junie-extension/marketplace.json,
  # shows "snowball" in the catalog under the marketplace name "snowball".

  > /extensions install snowball
  # Junie reads extensions[0].source, resolves to extensions/snowball/,
  # loads extension.json, copies the bundle content into
  # ~/.junie/extensions/snowball/snowball/.

  > /mcp
  # Shows: snowball-capture (Active), argdown (Active),
  # codebase-memory (Active).

  > /new "let's add a feature"
  # Junie starts a new session, injects .junie/AGENTS.md from the
  # installed extension as project context (the using-snowball
  # bootstrap + capture rules). Skills are discoverable from
  # ~/.junie/extensions/snowball/snowball/skills/.
```

**Steps from the marketplace JSON to a working install:**

1. Junie fetches `.junie-extension/marketplace.json` from the registered marketplace URL.
2. Parses the `extensions[]` array; for each entry, follows the `source` path relative to the marketplace root and loads the extension's `extension.json`.
3. Caches the extension content under `~/.junie/extensions/<marketplace-id>/<extension>/` (per the Junie docs on extension storage).
4. From the cached content, loads skills (from `skills/`), MCP servers (from `mcp/mcp.json`), and guidelines (from `.junie/AGENTS.md`).
5. The MCP servers are spawned and become available as Junie tools (`madr_capture`, `approval_phrase_record`, `observation_log`, etc., plus argdown and codebase-memory tools).
6. On session start, the guidelines content is injected as `AGENTS.md` context, which contains the bootstrap and capture rules.

**What the user does NOT have to do:**

- Clone the snowball repo manually.
- Run any install script.
- Configure MCP paths manually.
- Symlink or copy files.

The marketplace path is the only manual step (`/extensions marketplace add`), and the marketplace URL is the standard GitHub URL — no special hosting required.

**Edge case: marketplace URL points at a moving target.** Junie accepts the `owner/repo` shorthand and clones the repo locally. A stale local clone means stale metadata; `/extensions update` handles refresh. Not in scope for this change, but worth noting in the README.

### Error handling

Three classes of failure:

**1. Marketplace JSON is malformed or missing required fields.**

- Symptom: Junie's `/extensions marketplace add` rejects the URL with a parse error, or the marketplace appears in the catalog with `Failed` status.
- Detection: a lightweight JSON validation test (`tests/junie-cli/validate-marketplace.sh`) uses `python3 -m json.tool` and a minimal schema check (required fields: `name`, `extensions[]`, each extension's `name` and `source`).
- Recovery: developer fixes the JSON and the next install picks up the corrected version.

**2. Extension `source` path doesn't resolve to a real extension manifest.**

- Symptom: marketplace shows the extension, install fails with "no extension.json at <path>".
- Detection: the same test walks each `source` path, asserts the file exists, and checks it's valid JSON with at least `name` and `version`.
- Recovery: developer fixes the path or restores the manifest.

**3. MCP servers inside the bundle fail to start.**

- Symptom: `/mcp` shows `snowball-capture` / `argdown` / `codebase-memory` as `Failed` rather than `Active`.
- Detection: out of scope for this change. These servers have their own error handling (the `snowball-capture` server already has `src/errors.ts` and a Node startup path that the build script in `scripts/build-snowball-capture.sh` exercises). If they regress, the existing pre-commit hooks and the snowball-capture tests catch it, not anything new in this change.
- Recovery: out of scope.

**Renaming `mcp/.mcp.json` → `mcp/mcp.json` carries a small risk:**

- The old filename is referenced in any path the user might have cached under `~/.junie/extensions/...`. Mitigation: this is the first explicit marketplace entry, so no users have it installed via the marketplace path yet. The rename has no existing-install surface to break. (Users who manually pointed Junie at `extensions/snowball/` for the IDE plugin are a small group; the new filename is also accepted by Junie, so they keep working.)
- The build script that produces the `dist/server.cjs` artifact doesn't reference the MCP config path; only Junie at runtime reads it. Mitigation: no build path to break.

**What this change deliberately does not add:**

- A GitHub Action to validate the marketplace on PR. The local pre-commit test is enough for a static JSON; CI is the next step if the change grows.
- A self-test that runs `junie /extensions install` end-to-end. Requires a real Junie install and a non-CI environment; out of scope.
- Schema files for the marketplace. The Junie docs don't publish a JSON schema; the test asserts the shape by hand.

### Testing

**New: `tests/junie-cli/validate-marketplace.sh`** (small, stdlib-only bash).

A bash script that asserts the marketplace wiring is intact. Three checks:

1. **Marketplace JSON is valid and complete.**
   - `.junie-extension/marketplace.json` parses as JSON.
   - Has `name`, `description`, and `extensions[]` at the top level.
   - Every entry in `extensions[]` has `name` and `source`.

2. **Each `source` path resolves to a real extension manifest.**
   - For each `extensions[i].source`, follow the relative path from the marketplace file's directory.
   - Assert `<source>/extension.json` exists.
   - Assert it parses as JSON with `name` and `version`.

3. **MCP config is at the expected path.**
   - For each extension source, assert `<source>/mcp/mcp.json` exists.
   - Assert it parses as JSON with `mcpServers`.
   - Optional (skipped by default): assert the old `.mcp.json` does NOT exist (catches accidental re-introduction).

**Integration with the existing pre-commit pipeline:**

- Add `tests/junie-cli/validate-marketplace.sh` to `.pre-commit-config.yaml` under the existing shellcheck/test repos so it runs alongside the other harness tests (`test-claude-code`, `test-gitlab-duo`, etc.).
- No new CI workflow; the existing `.github/workflows/` jobs already run pre-commit.

**Manual verification path (out of scope for automation):**

- Clone the repo, register the marketplace in Junie CLI with `/extensions marketplace add ./` (local-dir form), install with `/extensions install snowball`, and confirm `/mcp` shows the three servers `Active`.
- This is a one-time smoke test the author runs before tagging the release. Documented in the commit message and the design spec, not automated.

**Existing tests that must keep passing:**

- `tests/claude-code/` — no overlap with the marketplace change, but pre-commit runs all of them.
- `tests/gitlab-duo/` — same.
- `tests/snowball-capture/` — the MCP server's own tests; unaffected by the rename.
- The `pre-commit-config.yaml` shellcheck, oxlint, oxfmt, shfmt, markdownlint — all run on the new files.

**What's deliberately not tested:**

- End-to-end `junie /extensions install` in CI. Requires a real Junie install, model auth, and a non-CI environment. Documented as a manual step in this spec.
- The marketplace against the actual JetBrains Junie marketplace format spec — there is no public JSON schema; the test asserts the shape by hand.

## Decisions (locked during brainstorming, 2026-06-16)

| Decision | Outcome |
| --- | --- |
| Scope of "explicit integration" | Junie CLI marketplace entry that wraps the existing bundle |
| Manifest format | New native `.junie-extension/marketplace.json` (not Claude-compatible) |
| Layout | Restructure to standard Junie layout — actually a no-op, the bundle was already in that layout |
| Blast radius | Wrapper + bundle convention cleanup (rename mcp/.mcp.json → mcp/mcp.json) |
| Approach | A — thin marketplace, rich extension.json (mirrors Claude Code convention) |
| Installer script | Rejected (marketplace path makes it unnecessary for Junie CLI) |
| Multi-extension-ready marketplace | Rejected (YAGNI; refactor when a second bundle exists) |
| Manifest version bump | No (feature-additive under v6.3.0) |
| Extension.json enrichment | Yes — author, homepage, repository, license, keywords |
| Extension.json version fix | Yes — `0.1.0` → `6.3.0` to match the rest of the repo |
| Pre-commit hook for marketplace test | Yes — under the existing shellcheck/test repos |
| End-to-end CI test of `/extensions install` | Rejected (requires live Junie, model auth, non-CI env) |

## Concrete edits

### 1. New file: `.junie-extension/marketplace.json`

Thin wrapper as shown in the Components section above.

### 2. Edit: `extensions/snowball/extension.json`

Enrich with `author`, `homepage`, `repository`, `license`, `keywords`; bump `version` to `6.3.0`.

### 3. Rename: `extensions/snowball/mcp/.mcp.json` → `extensions/snowball/mcp/mcp.json`

Identical content, canonical filename. Use `git mv` to preserve history.

### 4. New file: `tests/junie-cli/validate-marketplace.sh`

Stdlib-only bash script as described in the Testing section.

### 5. Edit: `.pre-commit-config.yaml`

Add a hook entry for `tests/junie-cli/validate-marketplace.sh` under the existing test repos.

### 6. Edit: `README.md`

Two changes:

- In the "What is different from upstream" changelog table, under the v6.3.0 row, append a one-line sub-bullet noting the marketplace entry: "Junie CLI discoverability: `.junie-extension/marketplace.json` lets Junie CLI users `/extensions marketplace add https://github.com/kellenff/snowball` and install via `/extensions install snowball`."
- In the "Per-harness adapters" table, update the Junie row to note "(CLI via marketplace entry; IDE plugin via local extension point)".

### 7. Edit: `RELEASE-NOTES.md`

Under the existing v6.3.0 section, add a sub-bullet:

```markdown
- **Junie CLI marketplace entry** — `.junie-extension/marketplace.json` wraps the existing `extensions/snowball/` bundle for Junie CLI discovery. Install with `/extensions marketplace add https://github.com/kellenff/snowball` then `/extensions install snowball`. Bundle's MCP config renamed to `mcp/mcp.json` (Junie's canonical filename); no content change.
```

## Manual verification

The only end-to-end check that exercises real Junie CLI. Run on a developer machine with Junie CLI installed and authenticated.

1. **Register the marketplace** — in a Junie CLI session, run `/extensions marketplace add ./` (local-dir form, pointing at the snowball repo root) or `/extensions marketplace add https://github.com/kellenff/snowball` (remote form).
2. **List the catalog** — run `/extensions` and confirm "snowball" appears under the registered marketplace.
3. **Install the extension** — run `/extensions install snowball`. Confirm the install completes without errors and the reference is written to `~/.junie/extensions/extensions.json`.
4. **Verify content cached** — list `~/.junie/extensions/<marketplace-id>/snowball/`. Confirm `extension.json`, `skills/`, `.junie/AGENTS.md`, `mcp/mcp.json`, and `snowball-capture/` are present.
5. **Verify MCP servers are Active** — run `/mcp`. Confirm `snowball-capture`, `argdown`, and `codebase-memory` are all `Active`, not `Failed` or `Inactive`.
6. **Verify bootstrap injection** — start a new session with `/new`. Confirm the agent receives the `using-snowball` text as project context (the agent can read it back on request, or you can inspect the session transcript).
7. **Verify a skill is reachable** — ask the agent to "use the brainstorming skill." Confirm the skill loads and the agent announces it's using it.
8. **Verify the decision spine** — ask a multi-choice question, answer it, and confirm a MADR file appears under `docs/snowball/decisions/`.
9. **Negative test** — try the install with a broken marketplace URL. Confirm Junie reports a clear error, not a silent failure.

## Open questions

**1. Marketplace schema field name (`extensions[]` vs `plugins[]`).** Junie's docs show the user-level `extensions.json` format (a list of installed extension *names*) and the Claude-compatible `.claude-plugin/marketplace.json` (which uses `plugins[]` for the catalog). The native `.junie-extension/marketplace.json` field for the catalog list is not explicitly documented. This spec uses `extensions[]` (objects, not strings) by inference. The manual verification step will catch a wrong field name on the first real install; if Junie rejects it, the fix is a one-character rename and the marketplace is republished.

**2. Pre-existing MCP-path placeholder.** The current `extensions/snowball/mcp/.mcp.json` (and the renamed `mcp/mcp.json`) carries a `<absolute-path-to-snowball>` placeholder in the `snowball-capture` `args`. This is a pre-existing issue not introduced by this spec — the IDE-plugin install path has the same problem and is documented as a manual step in the original Junie-support design. After a marketplace install, the bundle lives at `~/.junie/extensions/<marketplace-id>/snowball/`, so the placeholder as-written is meaningless to a user who never cloned the repo. This spec does not fix the placeholder; fixing it is a separate change that needs its own design pass. The known limitation is called out in the manual verification and the README so users hit it cleanly, not by surprise. The plausible future fix is one of: (a) ship a post-install path-resolution script, (b) bundle the MCP server's run command in a small wrapper that resolves paths at start time, or (c) restructure the bundle so the MCP config is generated at install time from a template.

## Known limitations

- **MCP server paths require a one-time fix after install.** As described in Open Question 2, the `snowball-capture` MCP server's `args` contain a `<absolute-path-to-snowball>` placeholder. A user who installs via the marketplace and then runs `/mcp` will see the server fail to start until the path is fixed. Documented in the README and the manual verification path. Out of scope for this spec.
- **Marketplace freshness is the user's responsibility.** Junie clones the marketplace repo locally; `/extensions update` is the refresh path. If the snowball repo's `main` branch changes the marketplace entry, the user's local catalog lags until they update. Standard for git-based marketplaces; not a regression.
