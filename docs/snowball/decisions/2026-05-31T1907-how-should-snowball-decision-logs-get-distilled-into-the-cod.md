---
title: >-
  How should snowball decision logs get distilled into the codebase-memory ADR doc? (The logs are many point-decisions;
  the ADR doc is prose sections — something has to bridge that gap.)
status: accepted
date: '2026-05-31T19:07:39.297Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 96196d54-3b68-4d2d-aeba-b90ba02163f0
  source_event_id: toolu_01HKzf2rMSv2vWgVBTqfzUkK
  supersedes: null
  tags:
    - ambient
---

# How should snowball decision logs get distilled into the codebase-memory ADR doc? (The logs are many point-decisions; the ADR doc is prose sections — something has to bridge that gap.)

## Context and Problem Statement

Question category: Distillation.

## Considered Options

- **Deterministic snowball script** — A snowball-side script reads docs/snowball/decisions/*.md + observations.jsonl and writes a structured list (title → outcome → rationale) into a DECISIONS section via manage_adr(update). Reproducible, no LLM, runnable from a hook — but it's a flat list, not true synthesis.
- **Agent/skill synthesis** — A snowball skill or sub-agent reads the logs and writes genuinely distilled prose into the relevant sections (TRADEOFFS/PHILOSOPHY/etc.) via manage_adr. Higher-fidelity summary; non-deterministic, costs an LLM run, invoked on demand.
- **Hybrid: script extracts, agent summarizes** — Script does the deterministic parse + dedupe into a structured intermediate; an agent step (optional/on-demand) turns that into polished section prose. Clean parse/synthesis split, but two moving parts to build and maintain.

## Decision Outcome

Chose **Agent/skill synthesis**. A snowball skill or sub-agent reads the logs and writes genuinely distilled prose into the relevant sections (TRADEOFFS/PHILOSOPHY/etc.) via manage_adr. Higher-fidelity summary; non-deterministic, costs an LLM run, invoked on demand.
