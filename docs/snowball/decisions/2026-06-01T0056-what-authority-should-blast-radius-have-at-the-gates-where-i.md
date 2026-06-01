---
title: What authority should blast-radius have at the gates where it fires
status: accepted
date: '2026-06-01T00:56:33.629Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 4eb3152b-162a-41a0-8df8-c57faff4a67d
  source_event_id: toolu_013zup6Lz6bc6zM4XUDR1neV
  supersedes: null
  tags:
    - ambient
---

# What authority should blast-radius have at the gates where it fires

## Context and Problem Statement

Question category: Authority.

## Considered Options

- **Report only (informational)** — Always produces a structured summary, never blocks. The calling skill (brainstorming, writing-plans, executing-plans, completion flow) decides whether to surface it, ask the operator, or proceed. Minimum coupling; respects snowball's 'evidence before assertions' principle without adding new gates. Risk: agent may ignore the report.
- **Report + recommendation** — Produces a summary AND a recommended next action: proceed, pause-for-confirmation, decompose, or abort. Calling skill is expected to follow the recommendation but can override. Stronger signal; still no new blocking primitive.
- **Gating (can pause execution)** — When the action-risk lens crosses a threshold (destructive, irreversible, externally-visible, shared-state mutation), blast-radius pauses and requires explicit operator approval before the calling skill continues. Implemented as a hook + skill pair. Highest safety; introduces new friction; needs careful threshold tuning to avoid nag fatigue.
- **Mixed by gate** — Design-time and completion-time gates get report-only treatment; pre-execution gets gating authority for genuinely high-risk actions (destructive shell commands, force-pushes, schema migrations, deletes). Matches the system prompt's existing 'executing actions with care' carve-out: most actions are local and reversible, only a few warrant a pause.

## Decision Outcome

Chose **Mixed by gate**. Design-time and completion-time gates get report-only treatment; pre-execution gets gating authority for genuinely high-risk actions (destructive shell commands, force-pushes, schema migrations, deletes). Matches the system prompt's existing 'executing actions with care' carve-out: most actions are local and reversible, only a few warrant a pause.
