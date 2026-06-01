---
title: >-
  What decision or outcome should this measurement effort ultimately serve? This drives everything downstream — what we
  instrument, whether it's a standing pipeline or a one-time study, and what counts as "performance."
status: accepted
date: '2026-06-01T05:37:10.069Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 71a11894-7f52-4d70-ba1c-d3c74c656d72
  source_event_id: toolu_01SdifbhUBbLdM2cECQVg6kA
  supersedes: null
  tags:
    - ambient
---

# What decision or outcome should this measurement effort ultimately serve? This drives everything downstream — what we instrument, whether it's a standing pipeline or a one-time study, and what counts as "performance."

## Context and Problem Statement

Question category: Goal.

## Considered Options

- **Standing observability layer** — A persistent telemetry pipeline: every session emits skill/hook metrics to OTel→Grafana so you can watch token cost, latency, and reliability trends over time. Treats snowball like a system you operate.
- **Port-decision analysis** — Measure to find which markdown/LLM skills are expensive or flaky enough to justify rewriting as deterministic scripts. The data feeds a refactor roadmap — on-brand with blast-radius and your 'deterministic tools' preference.
- **One-time characterization study** — A controlled experiment quantifying the inherent overhead of the markdown/LLM approach vs deterministic baselines. Produces a report and a decision, not a standing system.
- **Regression guardrail** — Dev/CI-time checks that flag when a skill edit increases tokens/latency or degrades reliability. Metrics wired into the development loop, not a dashboard you watch.

## Decision Outcome

Chose **Port-decision analysis**. Measure to find which markdown/LLM skills are expensive or flaky enough to justify rewriting as deterministic scripts. The data feeds a refactor roadmap — on-brand with blast-radius and your 'deterministic tools' preference.
