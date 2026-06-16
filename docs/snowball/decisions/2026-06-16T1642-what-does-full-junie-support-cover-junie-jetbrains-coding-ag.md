---
title: >-
  What does "full Junie support" cover? Junie (JetBrains' coding agent) can pick up skills several ways, and the
  decision-spine hooks may or may not be reachable. Which scope matches your goal
status: accepted
date: '2026-06-16T16:42:09.287Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 601a4cf0-6b0d-4767-aa38-d8223b792b1e
  source_event_id: call_function_twhjbs7gdbfi_1
  supersedes: null
  tags:
    - ambient
---

# What does "full Junie support" cover? Junie (JetBrains' coding agent) can pick up skills several ways, and the decision-spine hooks may or may not be reachable. Which scope matches your goal

## Context and Problem Statement

Question category: Scope.

## Considered Options

- **Skills + decision-spine hooks (full)** — Manifest, bootstrap loader, context file, AND hooks that capture MADRs (AskUserQuestion-equivalent, approval phrases) and observations (Stop/PreCompact equivalents). Mirrors Claude Code/Cursor coverage.
- **Skills + best-effort hooks** — Manifest + bootstrap + context file, with hooks wired only where Junie's hook rail is stable and proven. Defer the rest to follow-ups rather than ship a half-working capture pipeline.
- **Skills loading only (no hooks)** — Just the forward spine — Junie picks up the skills library as context, no decision-spine capture yet. Matches Gemini/OpenCode coverage. Faster to ship; can add hooks later.
- **Just the manifest + docs** — Smallest viable: a Junie-compatible manifest plus installation instructions, no bootstrap loader. Users wire context injection themselves.

## Decision Outcome

Chose **Skills + decision-spine hooks (full)**. Manifest, bootstrap loader, context file, AND hooks that capture MADRs (AskUserQuestion-equivalent, approval phrases) and observations (Stop/PreCompact equivalents). Mirrors Claude Code/Cursor coverage.
