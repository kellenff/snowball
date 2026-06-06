---
title: How should snowball's brainstorming skill reach chorus
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

# How should snowball's brainstorming skill reach chorus

## Context and Problem Statement

Question category: Wiring.

## Considered Options

- **Invoke chorus:chorus skill** — Replace the `m2-brainstorm:brain-jam` Skill-tool delegation with an invocation of the `chorus:chorus` skill. Keeps brainstorming as driver; chorus skill owns the CLI details. Cleanest, mirrors current delegate-then-reclaim pattern.
- **Call bin/chorus CLI directly** — Have the brainstorming skill run the `bin/chorus` binary itself with --prompt/--seed/--critique, then read the transcript. More control, but duplicates CLI knowledge into the skill.

## Decision Outcome

Chose **Invoke chorus:chorus skill**. Replace the `m2-brainstorm:brain-jam` Skill-tool delegation with an invocation of the `chorus:chorus` skill. Keeps brainstorming as driver; chorus skill owns the CLI details. Cleanest, mirrors current delegate-then-reclaim pattern.
