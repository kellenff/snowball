---
title: How should the skill detect chorus availability
status: accepted
date: '2026-06-06T05:28:09.068Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: a28342b8-e964-4579-a269-69400a9a5150
  source_event_id: toolu_01SzpQfn3qD7yZHBFpNhQ16P
  supersedes: null
  tags:
    - ambient
---

# How should the skill detect chorus availability

## Context and Problem Statement

Question category: Detection.

## Considered Options

- **Repo bin path** — Detect via `[ -x /Users/kellen/Projects/chorus/bin/chorus ]` (the current dev location). Simple but tied to a personal absolute path.
- **Skill presence only** — Drop the binary check; rely on the `chorus:chorus` skill being installed. The chorus skill itself handles missing-key/CLI errors. Cleaner if wiring via the skill.
- **Installed/symlinked path** — Assume chorus gets installed to a stable path (e.g. ~/.config/chorus/bin or PATH). Requires an install step outside this repo.

## Decision Outcome

Chose **Skill presence only**. Drop the binary check; rely on the `chorus:chorus` skill being installed. The chorus skill itself handles missing-key/CLI errors. Cleaner if wiring via the skill.
