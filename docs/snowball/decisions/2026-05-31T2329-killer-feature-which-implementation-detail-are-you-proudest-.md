---
title: Killer feature — which implementation detail are you proudest of? (This becomes the README's technical centerpiece.)
status: accepted
date: '2026-05-31T23:29:22.984Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 24d3f63c-18ea-4dd3-a03d-4253211e6402
  source_event_id: toolu_0161Di28YQyjWYwQdT8SFkzN
  supersedes: null
  tags:
    - ambient
---

# Killer feature — which implementation detail are you proudest of? (This becomes the README's technical centerpiece.)

## Context and Problem Statement

Question category: Proudest of.

## Considered Options

- **Passive decision capture** — Hooks observe events the skills already emit (AskUserQuestion, prompt patterns, Stop/PreCompact) — capture is a side-effect of working, no skill modified, nobody has to remember to log.
- **Capture → memory recall loop** — The full arc: rationale captured → committed onto the branch → distilled into codebase-memory's ADR → recalled by the next agent. 'A skills library that remembers.'
- **Multi-harness, zero-dep bootstrap** — One skills/ dir loads as agent behavior across 7 harnesses via one bash bootstrap that adapts its JSON per harness. No npm install.
- **Structured-reasoning layer** — argdown as an IR + the steelman/grounded-extension verification — reasoning structure preserved, not just conclusions.

## Decision Outcome

Chose **Capture → memory recall loop**. The full arc: rationale captured → committed onto the branch → distilled into codebase-memory's ADR → recalled by the next agent. 'A skills library that remembers.'
