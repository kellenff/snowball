---
title: What work do you want to do, given the existing Junie support is already implemented
status: accepted
date: '2026-06-16T21:56:02.437Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 42253f2e-c933-4aeb-90c2-8eaef3762c3c
  source_event_id: call_function_n4otl4d9cbxi_1
  supersedes: null
  tags:
    - ambient
---

# What work do you want to do, given the existing Junie support is already implemented

## Context and Problem Statement

Question category: Scope.

## Considered Options

- **Mark the existing plan as done** — Update docs/snowball/plans/2026-06-16-junie-support.md to check off the 70 checkboxes (which are stale; the work is actually committed). No new design work needed — just bookkeeping.
- **Fill a specific gap I see** — You have a specific gap in mind (e.g., the .mcp.json placeholders, missing tests, AGENTS.md bootstrap drift, no real Junie dogfood, etc.). Tell me what it is and I'll scope a small follow-up spec.
- **Build a snowball-junie CLI wrapper** — You want a snowball-bundled CLI command for Junie, despite the existing spec's rejection. I'll revisit that decision explicitly before designing.
- **Target a different 'junie cli'** — You mean a different 'junie cli' than the JetBrains Junie product the existing spec covers (e.g., a project-local CLI you're building). Tell me which.

## Decision Outcome

Chose **Mark the existing plan as done**. Update docs/snowball/plans/2026-06-16-junie-support.md to check off the 70 checkboxes (which are stale; the work is actually committed). No new design work needed — just bookkeeping.
