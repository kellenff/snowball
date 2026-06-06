---
title: >-
  The grfp brain-jam adapter only exists in the plugin cache (overwritten on plugin update, not tracked in this repo),
  and it does README-angle ideation — which chorus's own 'when not to use' explicitly defers to
  brainstorming/m2-brainstorm. How should I handle the grfp part of the swap
status: accepted
date: '2026-06-06T06:21:47.472Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 985b5bdd-8205-4ea1-8376-f7c0967acaeb
  source_event_id: toolu_015tnM8jofm6wpLxbD29egyW
  supersedes: null
  tags:
    - ambient
---

# The grfp brain-jam adapter only exists in the plugin cache (overwritten on plugin update, not tracked in this repo), and it does README-angle ideation — which chorus's own 'when not to use' explicitly defers to brainstorming/m2-brainstorm. How should I handle the grfp part of the swap

## Context and Problem Statement

Question category: grfp adapter.

## Considered Options

- **Skip, note as follow-up** — Make the durable swap in the snowball repo only. Document the grfp rewire as a follow-up that needs an upstream fork/local install to persist (cache edits get wiped on update).
- **Edit cache copy anyway** — Apply the swap to the cached grfp adapter now. It works until the next plugin update overwrites it; the change is not tracked in this repo. Matches the recorded decision literally.
- **Fork/vendor grfp** — Clone grfp locally and install from a local path, then swap — heavier setup but the change persists across updates.

## Decision Outcome

Chose **Skip, note as follow-up**. Make the durable swap in the snowball repo only. Document the grfp rewire as a follow-up that needs an upstream fork/local install to persist (cache edits get wiped on update).
