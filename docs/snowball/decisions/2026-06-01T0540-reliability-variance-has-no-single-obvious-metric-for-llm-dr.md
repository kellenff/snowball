---
title: >-
  Reliability/variance has no single obvious metric for LLM-driven work. Which notion of 'unreliable' should drive a
  port candidate
status: accepted
date: '2026-06-01T05:40:56.690Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 71a11894-7f52-4d70-ba1c-d3c74c656d72
  source_event_id: toolu_01GBkzFpih4Wjztd6vhkg5oh
  supersedes: null
  tags:
    - ambient
---

# Reliability/variance has no single obvious metric for LLM-driven work. Which notion of 'unreliable' should drive a port candidate

## Context and Problem Statement

Question category: Reliability.

## Considered Options

- **Both: per-run proxies + cross-run variance** — Emit cheap within-run signals each time (tool errors, retried calls, self-correction turns), and let the backend compute variance of those + token cost across many runs. Per-run is observable from the transcript; variance falls out of Grafana aggregation. Recommended.
- **Within-run error signals only** — Just count tool-call failures, repeated/retried tool calls, and correction turns inside one skill run. Simple, fully hook-observable, no cross-session math — but misses 'gives a different answer every time' flakiness.
- **Cross-run outcome variance only** — Focus on how much cost/outcome swings across many runs of the same skill. Directly measures non-determinism, but needs many runs and a stable notion of 'same task' to be meaningful.
- **Outcome correctness** — Whether the skill actually achieved its goal (pass/fail), likely via a judge or explicit success signal. The truest reliability measure but the most expensive and intrusive to capture.

## Decision Outcome

Chose **Both: per-run proxies + cross-run variance**. Emit cheap within-run signals each time (tool errors, retried calls, self-correction turns), and let the backend compute variance of those + token cost across many runs. Per-run is observable from the transcript; variance falls out of Grafana aggregation. Recommended.
