---
title: When in the lifecycle should the blast-radius analysis actually fire
status: accepted
date: '2026-06-01T00:55:50.369Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 4eb3152b-162a-41a0-8df8-c57faff4a67d
  source_event_id: toolu_01MnVQ4GqG6MVe8tUHusKFsn
  supersedes: null
  tags:
    - ambient
---

# When in the lifecycle should the blast-radius analysis actually fire

## Context and Problem Statement

Question category: Timing.

## Considered Options

- **Design-time only** — Fires during brainstorming/writing-plans, before code is touched. Output shapes the spec/plan: scope decisions, decomposition choices, risk callouts. The plan is the artifact that carries the blast-radius forward; no runtime surfacing. Cheapest, lowest noise, but a stale plan can drift from reality.
- **Pre-execution only** — Fires during executing-plans, before each meaningful action (file edit clusters, shared-state writes, destructive commands). Output is a 'do you really want to do this?' gate, mirroring the system prompt's 'executing actions with care.' Highest signal at the moment of action, but adds friction to every step.
- **Completion-time only** — Fires during finishing-a-development-branch / requesting-code-review. Output is a retrospective: 'here is what this branch actually touched, here is the cone of downstream impact, here is the operator-visible risk classification.' Becomes input to PR description and review focus. Low friction during work; high value at the gate.
- **All three, with different lenses at each gate** — Same composite analysis, surfaced differently: design-time for scope sizing, pre-execution for risky-action gating, completion-time for review/PR framing. Most coverage; most implementation surface; risk of nag fatigue if not tuned.

## Decision Outcome

Chose **All three, with different lenses at each gate**. Same composite analysis, surfaced differently: design-time for scope sizing, pre-execution for risky-action gating, completion-time for review/PR framing. Most coverage; most implementation surface; risk of nag fatigue if not tuned.
