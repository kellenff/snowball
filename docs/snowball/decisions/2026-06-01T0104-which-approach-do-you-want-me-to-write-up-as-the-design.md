---
title: Which approach do you want me to write up as the design
status: accepted
date: '2026-06-01T01:04:26.877Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 4eb3152b-162a-41a0-8df8-c57faff4a67d
  source_event_id: toolu_01McDHXv6ykGALZW1GLDDhs6
  supersedes: null
  tags:
    - ambient
---

# Which approach do you want me to write up as the design

## Context and Problem Statement

Question category: Approach.

## Considered Options

- **B — skill + audit-channel hook (Recommended)** — Single `snowball:blast-radius` skill invoked by the four lifecycle skills, with per-gate lens prominence. Thin hook on operator-approval phrases / Stop event captures the blast-radius snapshot to the decision spine — hook never gates, only observes. Reuses existing operator-approval primitive. Phase 1: skill ships everywhere; hook ships CC + Cursor first.
- **A — skill-only** — Same single skill, same per-gate lens prominence, no hooks. Smallest Phase 1 surface; harness-portable from day one. Loses the passive audit-capture story for the operator's confirmation moment. Coverage depends entirely on the four existing skills invoking blast-radius as a sub-step (acceptable — they already run on the discipline rail).
- **C — original hybrid with PreToolUse gating** — Skill at design/completion + PreToolUse hook that intercepts destructive Bash patterns and can deny pending approval. Accepts the jam's pushback (false positives, agent-blind state change) as the cost of guaranteed coverage at the action layer. Heaviest hook surface; mirrors the most defensive interpretation of 'passive before proactive'.
- **Something else / let's re-frame** — The jam shifted my framing in a way that doesn't match what you actually want. Want to push back on a reframe (the lens-prominence-per-gate model, the agent-owns-relevance argument, the dual-backend tri-status envelope, etc.) before we commit.

## Decision Outcome

Chose **B — skill + audit-channel hook (Recommended)**. Single `snowball:blast-radius` skill invoked by the four lifecycle skills, with per-gate lens prominence. Thin hook on operator-approval phrases / Stop event captures the blast-radius snapshot to the decision spine — hook never gates, only observes. Reuses existing operator-approval primitive. Phase 1: skill ships everywhere; hook ships CC + Cursor first.
