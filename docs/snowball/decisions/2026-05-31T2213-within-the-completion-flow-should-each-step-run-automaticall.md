---
title: >-
  Within the completion flow, should each step run automatically or be offered? (Committing records is cheap/safe;
  deriving the ADR costs an LLM synthesis run and needs codebase-memory indexed — the reason the sync skill is
  on-demand, not a hook.)
status: accepted
date: '2026-05-31T22:13:22.429Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 96196d54-3b68-4d2d-aeba-b90ba02163f0
  source_event_id: toolu_0179C1283M2ZXqBzHafMJUr8
  supersedes: null
  tags:
    - ambient
---

# Within the completion flow, should each step run automatically or be offered? (Committing records is cheap/safe; deriving the ADR costs an LLM synthesis run and needs codebase-memory indexed — the reason the sync skill is on-demand, not a hook.)

## Context and Problem Statement

Question category: Auto vs offer.

## Considered Options

- **Commit auto, ADR offered** — The flow always commits dangling decision records + observations as part of the work (cheap, safe, deterministic), then *offers* to derive the ADR (one prompt) since it's token-costly and dependency-bound. Keeps the sync skill's on-demand spirit.
- **Both automatic** — The flow commits records AND derives the ADR automatically on every feature completion (silently skipping ADR derivation when codebase-memory isn't available). Most hands-off; reintroduces an LLM cost on every completion.
- **Both offered** — The flow prompts before each step. Maximum control, least automatic — arguably defeats 'done as part of the flow.'

## Decision Outcome

Chose **Commit auto, ADR offered**. The flow always commits dangling decision records + observations as part of the work (cheap, safe, deterministic), then *offers* to derive the ADR (one prompt) since it's token-costly and dependency-bound. Keeps the sync skill's on-demand spirit.
