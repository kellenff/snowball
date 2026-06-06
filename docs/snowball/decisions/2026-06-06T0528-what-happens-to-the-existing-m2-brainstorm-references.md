---
title: What happens to the existing m2-brainstorm references
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

# What happens to the existing m2-brainstorm references

## Context and Problem Statement

Question category: m2 fate.

## Considered Options

- **Fully replace** — Remove all m2-brainstorm/MiniMax-specific wording and the m2 binary detection; chorus becomes the sole second-model companion.
- **Keep m2 as fallback** — Add chorus alongside; prefer chorus when available, fall back to m2-brainstorm. More resilient but more complex wording.

## Decision Outcome

Chose **Fully replace**. Remove all m2-brainstorm/MiniMax-specific wording and the m2 binary detection; chorus becomes the sole second-model companion.
