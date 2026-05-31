---
title: >-
  Which snowball log streams should feed the synthesis? (There are two: high-confidence operator MADRs, and the
  lower-confidence observations.jsonl stream of agent hypotheses/implementation-choices/constraints.)
status: accepted
date: '2026-05-31T19:50:16.003Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 96196d54-3b68-4d2d-aeba-b90ba02163f0
  source_event_id: toolu_01VzLKJzhwj7KeXHsfjyUBFv
  supersedes: null
  tags:
    - ambient
---

# Which snowball log streams should feed the synthesis? (There are two: high-confidence operator MADRs, and the lower-confidence observations.jsonl stream of agent hypotheses/implementation-choices/constraints.)

## Context and Problem Statement

Question category: Input scope.

## Considered Options

- **Operator MADRs only** — Only the *.md decision records (operator's explicit ask-user-question + approval-phrase choices). Cleanest signal, truest to the word 'decisions', smallest synthesis input. Ignores observations.jsonl entirely.
- **MADRs + filtered observations** — MADRs plus observations.jsonl entries filtered to high-confidence and/or type in {constraint, implementation-choice} — dropping speculative hypotheses. Richer rationale, still curated. Middle ground.
- **MADRs + all observations** — Everything: MADRs plus the full observations.jsonl (including medium/low-confidence hypotheses). Most complete context, but noisiest — synthesis has to actively discount speculation.

## Decision Outcome

Chose **MADRs + filtered observations**. MADRs plus observations.jsonl entries filtered to high-confidence and/or type in {constraint, implementation-choice} — dropping speculative hypotheses. Richer rationale, still curated. Middle ground.
