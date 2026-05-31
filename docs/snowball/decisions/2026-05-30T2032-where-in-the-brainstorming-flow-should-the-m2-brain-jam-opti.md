---
title: Where in the brainstorming flow should the m2 brain-jam option surface
status: accepted
date: '2026-05-30T20:32:49.019Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: cb3b8037-cc0f-4bf3-9bc3-5e177d5a5348
  source_event_id: toolu_01JX6gmWXFaRtWa2NfrCEfYh
  supersedes: null
  tags:
    - ambient
---

# Where in the brainstorming flow should the m2 brain-jam option surface

## Context and Problem Statement

Question category: Trigger point.

## Considered Options

- **At 'Propose approaches'** — Offer it at step 4, right alongside the existing structured-argumentation hook — fires only when 2-3 alternatives are stable and their trade-offs cross-cut (no clear winner). Most precise; matches brain-jam's documented sweet spot.
- **Session-level mode** — Offer it once up front like the Visual Companion ('available as a tool, not a mode'), then decide per-decision whether to invoke it throughout the session.
- **Multiple decision points** — Offer at the approaches step AND when exploration stalls on a hard call (e.g., user keeps revising, no option wins). More places it can help, but more complexity in the skill.

## Decision Outcome

Chose **Session-level mode**. Offer it once up front like the Visual Companion ('available as a tool, not a mode'), then decide per-decision whether to invoke it throughout the session.
