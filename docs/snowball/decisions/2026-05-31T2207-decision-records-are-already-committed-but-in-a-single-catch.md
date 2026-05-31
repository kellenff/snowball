---
title: >-
  Decision records are already committed, but in a single catch-all commit (c8d1d8e) rather than with their respective
  work — and there are concurrent commits I didn't author (npm switch + the catch-all). How should I make 'records
  committed as part of their work' true
status: accepted
date: '2026-05-31T22:07:59.106Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 96196d54-3b68-4d2d-aeba-b90ba02163f0
  source_event_id: toolu_011KD7bVTkZvDRgtJohGPvDt
  supersedes: null
  tags:
    - ambient
---

# Decision records are already committed, but in a single catch-all commit (c8d1d8e) rather than with their respective work — and there are concurrent commits I didn't author (npm switch + the catch-all). How should I make 'records committed as part of their work' true

## Context and Problem Statement

Question category: Approach.

## Considered Options

- **Practice going forward + commit dangling** — Don't rewrite existing history (safest with a concurrent actor present). Commit the only dangling item (observations.jsonl, 11 lines) now, and from here on bundle each piece of work's decision records into that work's commits. Adopt this as a standing practice.
- **Rewrite local history to split** — Interactive-rebase the catch-all c8d1d8e into per-work-stream record commits placed next to their work (m2-brainstorm vs snowball-sync), and commit the dangling observations.jsonl. Nothing is pushed so it's recoverable, but it rewrites recent commits — risky if the concurrent actor is still active.
- **Pause — sort out the concurrent commits first** — Before touching decision records, confirm the commits I didn't author (yarn→npm switch in df12247, the catch-all in c8d1d8e) are intended. Untangling those may change the right approach.

## Decision Outcome

Chose **Practice going forward + commit dangling**. Don't rewrite existing history (safest with a concurrent actor present). Commit the only dangling item (observations.jsonl, 11 lines) now, and from here on bundle each piece of work's decision records into that work's commits. Adopt this as a standing practice.
