---
title: >-
  Which signals should we capture per skill to drive the port decision? (Multi-select — a skill becomes a strong port
  candidate when it scores high on cost AND looks mechanizable.)
status: accepted
date: '2026-06-01T05:38:43.652Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 71a11894-7f52-4d70-ba1c-d3c74c656d72
  source_event_id: toolu_01FBqyf54A93Ea525ypNJVxq
  supersedes: null
  tags:
    - ambient
---

# Which signals should we capture per skill to drive the port decision? (Multi-select — a skill becomes a strong port candidate when it scores high on cost AND looks mechanizable.)

## Context and Problem Statement

Question category: Signals.

## Considered Options

- **Token cost** — Input/output/cache tokens attributed to a skill's execution window. The primary $ argument for porting — markdown the agent must read + reasoning it must do.
- **Wall-clock latency** — Time added per skill invocation. The UX argument — a slow deterministic script can still beat slow LLM reasoning, and this quantifies the gap.
- **Reliability / variance** — Retries, self-corrections, tool errors, and outcome inconsistency across runs of the same skill. The 'the LLM does this unreliably' argument — often the strongest reason to mechanize.
- **Tool-call profile** — Count and type of tools a skill drives. A high ratio of deterministic tool calls (Bash, scripts, file ops) signals work that's already half-mechanized and cheap to port fully.

## Decision Outcome

Chose **Reliability / variance, Token cost**.
