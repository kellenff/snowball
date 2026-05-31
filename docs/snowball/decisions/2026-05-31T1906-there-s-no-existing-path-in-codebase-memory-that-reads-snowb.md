---
title: >-
  There's no existing path in codebase-memory that reads snowball decision logs today — so this is net-new wiring.
  What's the end state you actually want? (What should be true once it 'can read snowball logs'?)
status: accepted
date: '2026-05-31T19:06:39.105Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 96196d54-3b68-4d2d-aeba-b90ba02163f0
  source_event_id: toolu_01SoE9UJTKuUV8j3vY2eFNoQ
  supersedes: null
  tags:
    - ambient
---

# There's no existing path in codebase-memory that reads snowball decision logs today — so this is net-new wiring. What's the end state you actually want? (What should be true once it 'can read snowball logs'?)

## Context and Problem Statement

Question category: End goal.

## Considered Options

- **Decisions queryable in graph** — Snowball MADRs + observations become first-class nodes in codebase-memory's knowledge graph, linked to the files they touched — so you can ask 'what decisions touched file X' or 'why did we choose Y'. Richest, most 'memory'-like; most work.
- **Feed the ADR summary doc** — Snowball decisions get distilled into codebase-memory's single 6-section project ADR document (PURPOSE/STACK/ARCHITECTURE/PATTERNS/TRADEOFFS/PHILOSOPHY). Reuses the existing manage_adr surface; lossy — many point decisions collapse into one summary.
- **Validated round-trip only** — Minimum viable: codebase-memory can parse the MADR/JSONL files without error and store them somewhere retrievable. Prove the seam works; defer rich querying/linking.

## Decision Outcome

Chose **Feed the ADR summary doc**. Snowball decisions get distilled into codebase-memory's single 6-section project ADR document (PURPOSE/STACK/ARCHITECTURE/PATTERNS/TRADEOFFS/PHILOSOPHY). Reuses the existing manage_adr surface; lossy — many point decisions collapse into one summary.
