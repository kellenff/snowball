# VTCode Hooks & Native Plugins — Opportunity Catalog

**Date:** 2026-06-24
**Status:** Accepted (post-brainstorm, pending user review of the written spec)
**Scope:** Ranked catalog of opportunities to deepen the VTCode harness adapter introduced in Snowball v6.6.0, grouped by goal (coverage / performance / automation / subagents / MCP / policy). No implementation in this design; each item is sized for a follow-on design doc when picked.
**Depends on:** v6.6.0 VTCode adapter ([2026-06-23-vtcode-support.md](./2026-06-23-vtcode-support.md)) already shipped
**Supersedes:** nothing
**Related:** [2026-06-16-junie-cli-marketplace-design.md](./2026-06-16-junie-cli-marketplace-design.md) (sibling adapter-deepen pattern)

## Problem

Snowball v6.6.0 shipped first-class VTCode support: forward spine via `.vtcode/AGENTS.md` and `.agents/skills/` symlinks, decision spine via `.vtcode/hooks.toml` (SessionStart, PostToolUse on `request_user_input`, UserPromptSubmit, Stop, PreCompact), and a validated wiring test. That's the minimum-viable surface. VTCode exposes additional native capabilities — cron primitives, MCP allowlist logging, a subagent table, a tool-policy matrix with auto-approval caches — that are **silent** in the decision spine today.

This catalog enumerates 26 opportunities across six goal-buckets. Each item carries an explicit Surface / Impact / Effort / Risk / VTCode-only rating so it can be lifted into its own design doc when picked. No code, no plan — just the roadmap.

## Goals

1. Map the full opportunity space for VTCode-specific hooks and native-plugin features that Snowball does not yet use.
2. Rank each opportunity on the same five dimensions so tradeoffs are visible at a glance.
3. Recommend a v6.7.0 shortlist (5 items) that fits one release without committing to L-effort work.
4. Surface open questions whose answers shape future items (MCP lifecycle hook TOML shape, `approval_cache` precedence, VTCode JS-plugin surface, cron token cost).
5. Stay readable as a single document — no implementation detail beyond a one-line sketch per item.

## Non-Goals

- **Designing any single item in depth.** Each item is a roadmap pointer; designing one deeply belongs in its own design doc. Catalog is the index, not the design.
- **Replacing shell-driven hooks with a VTCode JS plugin surface.** Speculative; depends on whether VTCode ships a JS hook runtime. Tracked in Open Question 2.
- **MCP server authoring.** Writing new MCP providers is a `mcp-builder` workflow, not a hooks question.
- **Cross-adapter parity work for Claude Code / Cursor / OpenCode.** Items tagged `VTCode-only: N` are surfaced here but designed elsewhere — they belong in a separate "adapter parity" catalog.
- **Restoring the `.vtcode/hooks.toml` file currently deleted in the working tree.** Flagged in Open Question 8 for separate triage.
- **Updating `validate-wiring.sh` or the tool mapping reference.** No change required by this catalog.

## Methodology

Each item carries the same five ratings so the catalog reads as a uniform table:

| Dimension    | Values                                     | Meaning                                                                                         |
| ------------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Surface      | hook · agent · cron · mcp · policy · skill | Which VTCode feature the item touches                                                           |
| Impact       | H · M · L                                  | Decision-spine quality / perf / capability gain                                                 |
| Effort       | S · M · L                                  | S = ≤1 file, ≤50 LoC, ≤1 bridge. M = new bridge + tests. L = new subagent, skill, or runtime    |
| Risk         | H · M · L                                  | Probability of breaking existing VTCode users (default-low; raising risk requires explanation)  |
| VTCode-only? | Y · N                                      | Whether the same item would also be valuable for Claude Code / Cursor (N items are parity work) |

Item blocks use this shape:

```text
### <Bucket>.<n> <Short title>
**Surface**: … · **Impact**: … · **Effort**: … · **Risk**: … · **VTCode-only**: …

<2–3 sentence idea — what we'd build and what the user gets>

*Sketch:* <one or two lines of TOML/script/bridge shape, only if it disambiguates the idea>

*Why now:* <one line on why this slot in the catalog>
```

---

## B1. Decision-spine coverage gaps

The decision spine captures `request_user_input` answers, operator approval phrases, and session-cycle observations. It is **silent** on every tool that touches code, shell, the web, or the planner.

### B1.1 PostToolUse on `apply_patch` — capture file-diff observations

**Surface**: hook · **Impact**: H · **Effort**: S · **Risk**: L · **VTCode-only**: N

Today, every code change leaves no observation in the MADR trail. A bridge mirroring `vtcode-post-tool-use-bridge.ts` (filter `tool_name === "apply_patch"`) writes a `kind: file-edit` observation with the unified diff and the touched paths. Two new files (`apply-patch-bridge.ts` + `apply-patch-bridge.sh`), one TOML matcher. Reuses `handleAskUserQuestion`'s payload normalization.

_Sketch:_ `[hooks.post_tool_use]` matcher `"apply_patch"` → `on-apply-patch-vtcode.sh` → `apply-patch-bridge.cjs`.

_Why now:_ This is the single highest-leverage coverage gap — every cycle touches files.

### B1.2 PostToolUse on `unified_exec` — capture command-and-output observations

**Surface**: hook · **Impact**: H · **Effort**: M · **Risk**: M · **VTCode-only**: N

Same shape as B1.1 but for shell commands. Adds `kind: shell-run` observations with command, exit code, and truncated stdout/stderr (≤2 KiB to bound storage). Risk = M because some commands (interactive TUIs, pagers) produce huge noisy output; the truncation policy needs care.

_Why now:_ Second-highest coverage gap — `unified_exec` is the most-used tool in any non-trivial session.

### B1.3 PostToolUse on `web_fetch` — research trail + cache

**Surface**: hook · **Impact**: M · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Hook fires on `web_fetch`, writes `kind: research` observation with URL, status, and a SHA-256 of the body so dedup works across sessions. Optionally writes a tiny JSON cache at `.vtcode/snowball-fetch-cache.json` (gitignored) so the next session's `web_fetch` for the same URL returns instantly.

_Sketch:_ `[hooks.post_tool_use]` matcher `"web_fetch"` → `on-web-fetch-vtcode.sh` → `web-fetch-bridge.cjs`.

_Why now:_ VTCode has no equivalent of Claude Code's built-in URL caching; this is uniquely valuable on this rail.

### B1.4 PostToolUse on `task_tracker` / `start_planning` / `finish_planning` — capture plan lifecycle

**Surface**: hook · **Impact**: M · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Three matchers, one shared bridge. Writes `kind: plan-event` observations when the agent sets up tasks, opens plan mode, or closes it. Feeds `recalling-project-context` so next cycle's tier-0 excerpt can summarize the last plan's outcomes.

_Why now:_ Today the plan-mode lifecycle is invisible to the decision spine; this is VTCode-specific because VTCode's plan-mode tools have their own names.

### B1.5 PreToolUse on `apply_patch` — blast-radius pre-audit

**Surface**: hook · **Impact**: H · **Effort**: M · **Risk**: M · **VTCode-only**: N

Mirrors the existing `hooks/blast-radius-audit.sh` behavior at `PreToolUse` for `apply_patch`. Audit runs _before_ the patch; on flagged risk, the hook can return `decision: "block"` (VTCode supports it via TOML) or inject additional context into the model's prompt. Risk = M because blocking a write mid-session is a behavior change; needs an opt-out env var (`SNOWBALL_BLAST_RADIUS=off`).

_Why now:_ Claude Code already runs this on `Bash` and `Edit`; VTCode has no equivalent.

### B1.6 PreToolUse on `unified_exec` — destructive-command pre-flight

**Surface**: hook · **Impact**: M · **Effort**: S · **Risk**: M · **VTCode-only**: N

Lighter-touch variant of B1.5 for `unified_exec` — runs `blast-radius-audit.sh operator-approval` against the command string, but only _warns_ (injects context), never blocks. Lower risk than B1.5 because warnings are non-fatal; user can still proceed.

_Why now:_ Cheapest safety net we can ship; pairs naturally with B1.5.

### B1.7 PostToolUse on `cron_*` — scheduled-task audit trail

**Surface**: hook · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Each `cron_create` writes a `kind: cron-scheduled` observation (cron expression, prompt); `cron_delete` writes `kind: cron-cancelled`. This is the spine-side counterpart to Bucket 3's automation use cases — if we're going to use cron, we want the trail.

_Why now:_ Required to make Bucket 3 self-consistent.

**Bucket 1 totals:** 7 items, mix of N/Y surfaces, all small to medium effort. Estimated combined effort: ~1 medium bridge + 4 small bridges + 1 TOML block + tests.

---

## B2. Latency and cold-start wins

### B2.1 Mark all bridge scripts `async = true` in TOML

**Surface**: hook · **Impact**: M · **Effort**: S · **Risk**: M · **VTCode-only**: Y

TOML flag tells VTCode to not block the agent turn on the bridge. Bridges must already write their results idempotently (they do — MADRs dedup by hash). Risk = M because async drops the synchronous "did this MADR write?" confirmation; debugging needs logs.

### B2.2 Skip `detectGitRoot()` when `$GIT_ROOT` is set

**Surface**: hook · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: N

Each bridge currently spawns `git rev-parse` (~20–50 ms cold). If session-start sets and exports `GIT_ROOT`, bridges read env directly. Trivial change across 4–5 bridges.

### B2.3 Memoize `using-snowball/SKILL.md` JSON escape in `session-start`

**Surface**: hook · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Every SessionStart re-reads + re-escapes SKILL.md. VTCode has no plugin-level cache; write a sidecar `.vtcode/snowball-bootstrap-cache.json` keyed by `(mtime, size)` of SKILL.md. Skip the escape when unchanged. Sub-100 ms win × every session start.

### B2.4 Combine `on-user-prompt.sh` + `blast-radius-audit.sh` into one node bridge

**Surface**: hook · **Impact**: L · **Effort**: M · **Risk**: L · **VTCode-only**: N

Two shell forks + two node invocations today. A single TS bridge runs both handlers in one process. ~30–60 ms saved per prompt. Same applies to the Stop hook.

---

## B3. Native cron automation

VTCode is the only Snowball adapter with cron primitives. This bucket uses them.

### B3.1 `cron_create` nightly MADR digest refresh

**Surface**: cron · **Impact**: H · **Effort**: M · **Risk**: M · **VTCode-only**: Y

Schedules `bash $SNOWBALL/scripts/refresh-adr-digest.sh` at 03:00 local. The digest is what `recalling-project-context` reads; refreshing it nightly keeps cycle-start recall fast. Risk = M because cron-managed prompts must not infinite-loop.

### B3.2 `cron_create` weekly staleness sweep

**Surface**: cron · **Impact**: M · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Runs `bun test tests/decision-logging && bun run check-stale-madrs`. Writes observations on stale MADRs into `docs/snowball/decisions/`. User reads them on next session-start.

### B3.3 `cron_create` orphan-MADR detector

**Surface**: cron · **Impact**: M · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Scans `docs/snowball/decisions/` for MADRs that don't reference any commit in the active branch. Surfaces them as observations; cheap insurance against accumulating dead decisions.

### B3.4 Emit cron inventory as SessionStart observation

**Surface**: hook · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Calls `cron_list` once at session-start, writes `kind: cron-inventory` observation. The agent sees "you have 3 scheduled tasks running" in tier-0 memory.

---

## B4. Subagent extensions via `[[agents]]`

VTCode configures subagents declaratively in `vtcode.toml`. Snowball ships one `<project>/vtcode.toml` fragment that consumers can include.

### B4.1 `snowball-reviewer` subagent

**Surface**: agent · **Impact**: H · **Effort**: M · **Risk**: L · **VTCode-only**: N

Subagent with `prompt_file = "skills/code-reviewer/SUBAGENT.md"` and `allowed_tools = ["unified_search", "unified_file", "unified_exec", "web_fetch"]`. Designed for review-mode dispatch in `verification-before-completion`.

### B4.2 `snowball-researcher` subagent

**Surface**: agent · **Impact**: M · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Uses `mcp_connect_server` to wire `context7`, then runs research. The hook rail (B5) will emit provider init events; this subagent is the consumer.

### B4.3 `snowball-planner` subagent

**Surface**: agent · **Impact**: M · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Wraps `brainstorming` + `writing-plans` skills, exposes them via `task_tracker`. Hands off to `start_planning` when the plan is ready.

### B4.4 Subagent output integration with decision spine

**Surface**: agent · **Impact**: M · **Effort**: M · **Risk**: M · **VTCode-only**: Y

Subagent returns go through `experimental`-equivalent hooks; we capture them as observations tagged `source: subagent:<name>`. Without this, B4.1–4.3 produce isolated work, not a trail.

---

## B5. MCP provider lifecycle observation

`tool-policy.json` already declares `mcp.provider_initialized`, `mcp.tool_filtered`, etc. in its `default.logging` array. Snowball's hook rail can subscribe.

### B5.1 Hook `mcp_connect_server` / `mcp_disconnect_server` PostToolUse

**Surface**: mcp · **Impact**: M · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Writes `kind: mcp-provider` observation on every connect/disconnect. Gives the decision spine a record of which MCP servers the session used.

### B5.2 Hook `mcp_tool_filtered` / `mcp_tool_denied`

**Surface**: mcp · **Impact**: M · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Captures policy enforcement: which tools were denied and why. Useful for tuning `approval_cache` (Bucket 6) — denied-tools data drives auto-approval candidates.

### B5.3 Hook `mcp_search_tools` result caching

**Surface**: mcp · **Impact**: L · **Effort**: M · **Risk**: L · **VTCode-only**: Y

Same shape as B1.3 — SHA-256 of `(provider, query)` keys a tiny JSON cache. Cross-session dedup for `mcp_search_tools` is a 5–10× latency win in research-heavy sessions.

### B5.4 Emit provider-init telemetry on SessionStart

**Surface**: mcp · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: Y

On session-start, the bootstrap reads `~/.vtcode/mcp-providers.json` (or VTCode's equivalent) and writes `kind: mcp-inventory` observation. Pairs with B3.4's cron inventory.

---

## B6. Tool-policy auto-approval

`tool-policy.json` exposes `approval_cache.{allowed, prefixes, regexes}`. Currently all three arrays are empty. This bucket populates them based on observed usage.

### B6.1 Auto-approve `unified_search` (prefix)

**Surface**: policy · **Impact**: M · **Effort**: S · **Risk**: M · **VTCode-only**: Y

Adds `unified_search` to `approval_cache.prefixes`. Read-only by construction. Risk = M because we need to audit that no `unified_search` action mutates.

### B6.2 Auto-approve read-only `unified_file` actions via regex

**Surface**: policy · **Impact**: M · **Effort**: S · **Risk**: M · **VTCode-only**: Y

Regex like `^unified_file read .*` matches read actions only. Write/edit stay `prompt`. Adds a single regex entry.

### B6.3 Auto-approve safe shell patterns

**Surface**: policy · **Impact**: M · **Effort**: S · **Risk**: H · **VTCode-only**: Y

Regexes like `^(git|ls|cat|rg|grep) [a-zA-Z0-9 _./-]+$`. Risk = H because shell auto-approval is dangerous; gate behind an explicit `SNOWBALL_TRUST_SHELL=1` env var.

### B6.4 `request_user_input` already auto-approved?

**Surface**: policy · **Impact**: L · **Effort**: S · **Risk**: L · **VTCode-only**: Y

Confirm `request_user_input` is `allow` (not `prompt`) in the default `tool-policy.json`. If not, switch it. Eliminates the user-prompt dance when the agent needs clarification.

---

## Selection guidance for v6.7.0

Five items, spanning coverage / safety / automation / policy / perf, all S or M effort:

| #        | Item                                      | Why this slot                                                                                                                                       |
| -------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **B1.1** | PostToolUse on `apply_patch`              | Single highest-leverage coverage gap — every cycle touches files. S effort, H impact, ships everywhere downstream of `vtcode-post-tool-use-bridge`. |
| **B1.5** | PreToolUse on `apply_patch` blast-radius  | Parity item — Claude Code already has this for Bash/Edit. VTCode users without it are exposed.                                                      |
| **B3.1** | Nightly `cron_create` MADR digest refresh | VTCode-only cron primitive, no other adapter has it. Digest drives `recalling-project-context`.                                                     |
| **B6.1** | `unified_search` auto-approval            | S effort, removes prompt-thrash on every read. Quick user-experience win.                                                                           |
| **B2.1** | All bridges `async = true`                | Performance across the board. Bridges already dedup by hash, so async is safe in practice.                                                          |

**Honorable mentions for v6.7.1+:** B4.1 (`snowball-reviewer` subagent — biggest native-plugin unlock, but L effort), B1.4 (plan lifecycle hook — pairs with B4.3), B5.1 + B5.2 (MCP provider lifecycle observation — depend on Open Question 1).

---

## Open questions / out of scope

These came up during exploration but need follow-on before they belong in this catalog:

1. **MCP lifecycle hook TOML shape.** Assumed `mcp_tool_filtered` etc. can appear as `PostToolUse` matcher values. _Verify against [vinhnx/vtcode tool-policy.md](https://github.com/vinhnx/vtcode/blob/main/docs/tool-policy.md) before designing B5._
2. **VTCode plugin runtime (JS surface).** OpenCode has `experimental.chat.messages.transform`; if VTCode ships a JS hook runtime, half of B4 (subagents) becomes more capable and the catalog should be re-cut.
3. **`approval_cache` precedence semantics.** Need to know whether `regexes` overrides `prefixes` or vice versa before B6.3 is safe.
4. **`cron_create` token cost.** Each scheduled prompt burns input tokens. Budget impact on free-tier VTCode users unknown.
5. **Skill auto-loading path.** Today we symlink into `.agents/skills/`. If VTCode adds marketplace-style install, the symlink model breaks. Out of scope here; tracked separately.
6. **v6.6.0 → v6.7.0 migration.** `tool-policy.json` shape may change (B6). Need a migration note for users on `kellenff/snowball` v6.6.0.
7. **Test surface.** `tests/vtcode/validate-wiring.sh` is wiring-only. Per-item acceptance criteria need new tests, likely under `tests/vtcode/` paralleling `tests/decision-logging/`. Design deferred to writing-plans.
8. **`.vtcode/hooks.toml` is currently deleted in the working tree** (as of 2026-06-24). The validate-wiring script asserts the file exists. May want to restore or update the script. Out of scope for this catalog.

9. **B2.1 async hook support in VTCode TOML (resolved 2026-06-24).** Researched against `https://github.com/vinhnx/vtcode/blob/main/docs/config/CONFIG_FIELD_REFERENCE.md` (the canonical hook schema lives there, not in `docs/hooks.md`). The `[[hooks.lifecycle.<event>.hooks]]` entry shape supports exactly three fields: `command` (required string), `timeout_seconds` (optional int|null), and `type` (optional, currently only `"command"`). The parent group supports `matcher` (optional regex) and `quiet_success_output` (optional bool). **No `async` / `run_async` / `background` field is documented on either the group or the entry level.** Hook execution is described as strictly synchronous: commands execute sequentially within each group. The `background` namespace that does appear in the config is under `subagents.background.*`, which controls background subagent toggling — unrelated to hook lifecycle. **Conclusion: B2.1 is dropped from v6.7.0; revisit when VTCode ships async hook support.** The implementation plan's Tasks 9–10 are skipped.

---

## Out of scope (not in this catalog)

- **Replacing shell-driven hooks with a VTCode JS plugin** — too speculative; depends on Open Question 2.
- **MCP server development** (writing new MCP providers) — that's a `mcp-builder` workflow, not a hooks question.
- **Cross-adapter parity** — Claude Code / Cursor / OpenCode parity items are surfaced as `VTCode-only: N` tags but not designed here. They belong in a separate "adapter parity" catalog.
- **Restoring `.vtcode/hooks.toml`** — Open Question 8, separate triage.

---

## Catalog totals

| Bucket           | Items  | H-impact | S-effort | VTCode-only |
| ---------------- | ------ | -------- | -------- | ----------- |
| B1 Coverage gaps | 7      | 3        | 3        | 3           |
| B2 Latency       | 4      | 0        | 3        | 2           |
| B3 Cron          | 4      | 1        | 2        | 4           |
| B4 Subagents     | 4      | 1        | 0        | 3           |
| B5 MCP lifecycle | 4      | 0        | 3        | 4           |
| B6 Policy        | 4      | 0        | 4        | 4           |
| **Total**        | **27** | **5**    | **15**   | **20**      |

Counts verified against the catalog above. B1.7 (the spine-side cron audit) and B3.x items (cron automation) are distinct opportunities: B1.7 is the observation bridge, B3.x are the cron-managed actions that produce events the bridge captures.

---

## References

- [VTCode repository](https://github.com/vinhnx/vtcode)
- [VTCode tool-policy reference](https://github.com/vinhnx/vtcode/blob/main/docs/tool-policy.md)
- [Snowball v6.6.0 VTCode support plan](./2026-06-23-vtcode-support.md)
- [Decision-logging bridge architecture](./2026-05-25-decision-logging-design.md)
- [OpenCode plugin pattern (sibling adapter-deepen precedent)](./2025-11-22-opencode-support-design.md)
