---
title: What should the analysis use as its source of truth
status: accepted
date: '2026-06-01T00:57:20.925Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 4eb3152b-162a-41a0-8df8-c57faff4a67d
  source_event_id: toolu_01HeebjefDLmoHybf9cBpzHr
  supersedes: null
  tags:
    - ambient
---

# What should the analysis use as its source of truth

## Context and Problem Statement

Question category: Backend.

## Considered Options

- **Codebase-memory graph (required)** — Failure-impact lens is powered by the codebase-memory MCP: search_graph, detect_changes, trace_path, call-graph fan-out. The analysis is rich and structural but only works in projects where codebase-memory is indexed. Honest about its dependency; degrades by self-skipping when MCP is unavailable. Same maturity-boundary pattern as recalling-project-context.
- **Lightweight heuristics only (no MCP)** — git diff + file-pattern heuristics (paths matching schemas/, hooks/, .github/, deps lockfiles, etc.) + a hard-coded action-risk rubric. Works in any project; shallow analysis. No structural call-graph reasoning. Phase 1 friendly.
- **Codebase-memory when present, heuristics as fallback** — Try the graph first; gracefully degrade to heuristics when codebase-memory isn't indexed or MCP is unreachable. Report explicitly states which backend it ran against ('structural' vs 'heuristic'). Operator knows the confidence level of the output. Honest maturity-boundary; works universally.
- **Backend pluggable / operator chooses** — Operator declares which backend to use per project via a settings file. More flexibility, more configuration surface; probably overkill for Phase 1.

## Decision Outcome

Chose **Codebase-memory when present, heuristics as fallback**. Try the graph first; gracefully degrade to heuristics when codebase-memory isn't indexed or MCP is unreachable. Report explicitly states which backend it ran against ('structural' vs 'heuristic'). Operator knows the confidence level of the output. Honest maturity-boundary; works universally.
