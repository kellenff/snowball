---
title: Which references should this integration update
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

# Which references should this integration update

## Context and Problem Statement

Question category: Scope.

## Considered Options

- **snowball brainstorming only** — Update only `skills/brainstorming/SKILL.md` (the M2 Brain-Jam Companion section, checklist, digraph). This is the file owned by the snowball repo.
- **Also grfp readme path** — Also rewire claudikins-grfp's brain-jam delegation (m2-brainstorm:readme-brain-jam → chorus). Note: that file lives in the plugin cache, not this repo, so edits are fragile/overwritten on update.

## Decision Outcome

Chose **Also grfp readme path**. Also rewire claudikins-grfp's brain-jam delegation (m2-brainstorm:readme-brain-jam → chorus). Note: that file lives in the plugin cache, not this repo, so edits are fragile/overwritten on update.
