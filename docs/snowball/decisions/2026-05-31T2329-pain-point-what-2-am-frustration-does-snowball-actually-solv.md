---
title: Pain point — what 2 AM frustration does Snowball actually solve? (This becomes the README's opening hook.)
status: accepted
date: '2026-05-31T23:29:22.984Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 24d3f63c-18ea-4dd3-a03d-4253211e6402
  source_event_id: toolu_0161Di28YQyjWYwQdT8SFkzN
  supersedes: null
  tags:
    - ambient
---

# Pain point — what 2 AM frustration does Snowball actually solve? (This becomes the README's opening hook.)

## Context and Problem Statement

Question category: Pain solved.

## Considered Options

- **Lost rationale** — 'Why did we make this choice three weeks ago?' — the reasoning behind agent-driven decisions evaporates the moment the session ends.
- **Ungated agents** — The agent skips straight to coding and builds the wrong thing — no design, no plan, no verification before claiming done.
- **Decisions lost to compaction** — Context-window compaction silently summarizes away the decisions made earlier in a long session.
- **Harness lock-in** — Your carefully-built skills only work in one tool; switching harnesses means starting over.

## Decision Outcome

Chose **Lost rationale**. 'Why did we make this choice three weeks ago?' — the reasoning behind agent-driven decisions evaporates the moment the session ends.
