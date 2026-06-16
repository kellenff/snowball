---
title: >-
  Which Junie surface(s) are we targeting? This shapes the manifest, the bootstrap path, and which Junie APIs we can
  lean on for hooks.
status: accepted
date: '2026-06-16T16:48:55.282Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 601a4cf0-6b0d-4767-aa38-d8223b792b1e
  source_event_id: call_function_9dvnlpzsvwzg_1
  supersedes: null
  tags:
    - ambient
---

# Which Junie surface(s) are we targeting? This shapes the manifest, the bootstrap path, and which Junie APIs we can lean on for hooks.

## Context and Problem Statement

Question category: Junie surface.

## Considered Options

- **Junie CLI** — JetBrains' command-line Junie agent (similar surface to Claude Code or Codex CLI). Usually the cleanest place to start — shell-driven, hooks feasible, manifest is typically a directory layout.
- **Junie in IDE plugin** — Junie running inside a JetBrains IDE (IntelliJ/PyStorm/etc.). Uses the JetBrains plugin model; hooks and skills pickup may be different.
- **Both CLI and IDE plugin** — Both surfaces. Probably means two manifests and shared bootstrap. Doubles the surface area; usually only worth it if you actually use both.
- **Not sure — research it** — Let me research Junie's plugin/hook/skills surface before designing. I'd suggest the docs/web and then come back with concrete options.

## Decision Outcome

Chose **Junie in IDE plugin**. Junie running inside a JetBrains IDE (IntelliJ/PyStorm/etc.). Uses the JetBrains plugin model; hooks and skills pickup may be different.
