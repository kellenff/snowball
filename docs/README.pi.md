---
name: pi-readme
description: Install and use snowball in pi.
---

# Snowball for Pi

Snowball ships as a pi package: one command, no shell installer.

## Install

```bash
pi install git:github.com/kellenff/snowball
```

Pi clones the repo into `~/.pi/agent/git/snowball/` and auto-discovers:

- The bootstrap extension at `extensions/pi/snowball.ts`.
- All snowball skills at `skills/<name>/SKILL.md`.

Verify the install:

```bash
pi list               # snowball appears in the package list
pi -p "list skills"   # skills are visible to the agent
```

## What you get

At every agent-start, the extension appends the bootstrap (the `using-snowball/SKILL.md` content wrapped in `<EXTREMELY_IMPORTANT>` framing) **iff the system prompt does not already contain the marker**. This makes `/reload` and other re-invocations idempotent — the bootstrap is never duplicated.

The agent follows the skill-check discipline: it invokes any matching skill before responding, exactly as on Claude Code.

Skills are invoked with the `/skill:` slash command. For example, before non-trivial design work:

```text
/skill:brainstorming
```

The agent sees the full skill content and follows its checklist. The `/skill:` syntax is a pi-native feature (not a snowball mechanism) — every pi package responds to it.

## Tool name mapping

Snowball skills are written for Claude Code tool names (`Read`, `Edit`, `Bash`, etc.). Pi's built-in tools are lowercase (`read`, `edit`, `bash`). The mapping reference at [`skills/using-snowball/references/pi-tools.md`](../skills/using-snowball/references/pi-tools.md) covers every Claude Code primitive, including the tools pi does not provide (`AskUserQuestion`, `TodoWrite`, `Task`, `WebFetch`).

## Decision spine (partial)

Snowball's decision spine captures operator MADRs and emits observations at session end. In pi, coverage is:

- ✅ Approval-phrase MADRs (operator types "looks good", "ship it", etc. — captured automatically).
- ✅ Blast-radius audits at session shutdown and on operator approvals.
- ✅ Implicit observation extraction before compaction and at session shutdown.
- ❌ Structured-question MADRs. Pi has no `AskUserQuestion` equivalent, so the most common MADR source on Claude Code is unavailable here.

This matches the Junie posture: forward spine complete, decision spine partial.

## Update

```bash
pi install git:github.com/kellenff/snowball   # re-run to refresh
```

Or to refresh only snowball without touching other packages:

```bash
pi update git:github.com/kellenff/snowball
```

## Uninstall

```bash
pi remove git:github.com/kellenff/snowball
```

Pi deletes the package directory and unregisters the extension and skills. No project files were modified — snowball is project-agnostic in pi.

## Local development

Clone the repo and run the extension from the local checkout while iterating:

```bash
git clone https://github.com/kellenff/snowball ~/Projects/snowball
pi -e ~/Projects/snowball/extensions/pi/snowball.ts
```

Edits in the clone take effect on next `/reload`. Once stable, `pi install git:github.com/kellenff/snowball` from the same checkout publishes the version you tested.

## Known gaps

- `AskUserQuestion` → plain text (see [pi-tools.md](../skills/using-snowball/references/pi-tools.md#operator-prompts)).
- `TodoWrite` → write a `TODO.md` file (see [pi-tools.md](../skills/using-snowball/references/pi-tools.md#task-tracking)).
- `Task` (subagent) → install a subagent package or spawn `pi` via tmux.
- `EnterPlanMode` / `ExitPlanMode` → write the plan to a file under `docs/snowball/plans/`.

## Platform notes

The extension forks `<repo>/skills/decision-logging/scripts/extract-worker.sh` via `spawn("bash", ...)`. On Windows this requires `bash` to be on `PATH` (e.g., Git Bash, WSL, or a similar environment). On native Windows shells without bash, the extraction fork will fail silently (with a `[snowball-pi] extract-spawn-failed` warning in the terminal). The decision spine's blast-radius audits still fire on operator approvals; only the end-of-session observation extraction is affected.
