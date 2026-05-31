---
title: >-
  This is a GRFP re-run on a repo that already has a strong, fork-aware README (from the May 25 run). How should I scope
  the pipeline
status: accepted
date: '2026-05-31T23:13:15.499Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 24d3f63c-18ea-4dd3-a03d-4253211e6402
  source_event_id: toolu_01WDyBBabvrzjeZnViKBYYBC
  supersedes: null
  tags:
    - ambient
---

# This is a GRFP re-run on a repo that already has a strong, fork-aware README (from the May 25 run). How should I scope the pipeline

## Context and Problem Statement

Question category: Run scope.

## Considered Options

- **Full refresh, regen README** — Run all 5 phases against current reality (decision-trail, m2-brainstorm, docs/design process+steelman). Phase 5 rewrites README.md from scratch — strongest result, but discards the current prose unless re-derived.
- **Refresh reports, then decide** — Run Phases 1–4 (deep-dive → crystal-ball → brain-jam → think-tank) to refresh the stale reports, review what changed, and decide on the README rewrite at Phase 5 with eyes open.
- **Targeted README update** — Skip the full pipeline. Update only the sections the recent work changed (decision spine, process docs, skill count), preserving the existing structure and fork posture.
- **Status only** — Just show the state of the prior run and what's stale — take no further action yet.

## Decision Outcome

Chose **Full refresh, regen README**. Run all 5 phases against current reality (decision-trail, m2-brainstorm, docs/design process+steelman). Phase 5 rewrites README.md from scratch — strongest result, but discards the current prose unless re-derived.
