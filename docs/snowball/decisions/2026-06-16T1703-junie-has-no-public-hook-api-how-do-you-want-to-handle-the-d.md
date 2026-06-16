---
title: Junie has no public hook API. How do you want to handle the decision-spine gap? This changes the design materially.
status: accepted
date: '2026-06-16T17:03:29.971Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 601a4cf0-6b0d-4767-aa38-d8223b792b1e
  source_event_id: call_function_nvbzwkpirl3x_1
  supersedes: null
  tags:
    - ambient
---

# Junie has no public hook API. How do you want to handle the decision-spine gap? This changes the design materially.

## Context and Problem Statement

Question category: Hook gap.

## Considered Options

- **Push back on the constraint, design around it** — Treat the missing hook API as a real constraint and design around it: skills + AGENTS.md (project guidelines) + MCP server (active capture via MCP tools the agent can call). Document the gap in the design and accept that the decision spine is partial on Junie until JetBrains adds a hook rail.
- **Wrapper-script approach for decision spine** — Build a thin wrapper around the `junie` CLI that injects a stop/pre-compact hook as a side-channel. Keeps the decision spine working, adds one more moving part (a wrapper script in this repo).
- **Reduce to skills + AGENTS.md only** — Reduce scope to "skills + AGENTS.md + MCP server" — no decision spine. Matches what the constraints actually support; re-prioritize forward spine quality.
- **Park this, decide after seeing options** — Keep going and surface this as a constraint in the design itself, with options for the user to pick from in the approaches step.

## Decision Outcome

Chose **Push back on the constraint, design around it**. Treat the missing hook API as a real constraint and design around it: skills + AGENTS.md (project guidelines) + MCP server (active capture via MCP tools the agent can call). Document the gap in the design and accept that the decision spine is partial on Junie until JetBrains adds a hook rail.
