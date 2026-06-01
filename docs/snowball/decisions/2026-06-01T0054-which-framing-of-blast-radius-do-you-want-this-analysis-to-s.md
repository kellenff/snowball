---
title: Which framing of 'blast radius' do you want this analysis to surface
status: accepted
date: '2026-06-01T00:54:25.088Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 4eb3152b-162a-41a0-8df8-c57faff4a67d
  source_event_id: toolu_01XcZUT1z5FXb3d2GCZrueW8
  supersedes: null
  tags:
    - ambient
---

# Which framing of 'blast radius' do you want this analysis to surface

## Context and Problem Statement

Question category: Framing.

## Considered Options

- **Failure-impact (reachability)** — If this change breaks, what else breaks? Uses codebase-memory's call-graph and fan-out to enumerate downstream callers, shared modules, and tests that depend on the changed surface. Answers 'how big is the cone of damage if I'm wrong?'
- **Change-scope (touched surface)** — What will this change actually modify? Files, modules, public APIs, schemas, hooks, settings. Answers 'how much of the codebase am I touching, and how much of it is a stable contract vs. internal detail?'
- **Action-risk (reversibility)** — How recoverable is this action if it goes wrong? Classifies actions by reversibility, shared-state impact, externally-visible effects (pushes, releases, schema migrations, deletes). Answers 'do I need explicit confirmation, a checkpoint, or a worktree before I do this?' Mirrors the system prompt's 'executing actions with care' section.
- **All three under one umbrella** — A composite analysis that reports change-scope, failure-impact, and action-risk together as one structured 'blast radius' summary. Higher implementation cost; richer signal at decision points.

## Decision Outcome

Chose **All three under one umbrella**. A composite analysis that reports change-scope, failure-impact, and action-risk together as one structured 'blast radius' summary. Higher implementation cost; richer signal at decision points.
