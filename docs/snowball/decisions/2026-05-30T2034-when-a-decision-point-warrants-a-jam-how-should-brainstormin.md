---
title: When a decision point warrants a jam, how should brainstorming run it
status: accepted
date: '2026-05-30T20:34:13.071Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: cb3b8037-cc0f-4bf3-9bc3-5e177d5a5348
  source_event_id: toolu_018m289jjyHwMJoSXvZDqXV9
  supersedes: null
  tags:
    - ambient
---

# When a decision point warrants a jam, how should brainstorming run it

## Context and Problem Statement

Question category: Invocation.

## Considered Options

- **Delegate to brain-jam skill** — Brainstorming invokes the m2-brainstorm:brain-jam skill, which handles seed-writing, CLI, transcript, and synthesis, then folds the angles back into the approaches discussion. DRY — reuses the maintained unit. Risk: brain-jam's own 'NOT for from-scratch' guard and its hand-off step could try to take control.
- **Call CLI directly** — Brainstorming embeds a short recipe (write seed, run the binary, read the JSON, synthesize) and never leaves its own flow. No skill-handoff confusion, brainstorming stays in control. Cost: duplicates a slimmed version of brain-jam's guidance, which could drift from the plugin.
- **Delegate, CLI fallback** — Prefer invoking the brain-jam skill; document the direct-CLI recipe as a fallback for when the skill isn't resolvable but the binary is present. Most robust, but the most prose to maintain in the skill.

## Decision Outcome

Chose **Delegate to brain-jam skill**. Brainstorming invokes the m2-brainstorm:brain-jam skill, which handles seed-writing, CLI, transcript, and synthesis, then folds the angles back into the approaches discussion. DRY — reuses the maintained unit. Risk: brain-jam's own 'NOT for from-scratch' guard and its hand-off step could try to take control.
