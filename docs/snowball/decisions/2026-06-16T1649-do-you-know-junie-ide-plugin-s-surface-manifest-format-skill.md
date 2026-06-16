---
title: >-
  Do you know Junie IDE plugin's surface (manifest format, skills pickup, hook support), or should I research it before
  continuing
status: accepted
date: '2026-06-16T16:49:19.792Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 601a4cf0-6b0d-4767-aa38-d8223b792b1e
  source_event_id: call_function_teii7kqxrq6u_1
  supersedes: null
  tags:
    - ambient
---

# Do you know Junie IDE plugin's surface (manifest format, skills pickup, hook support), or should I research it before continuing

## Context and Problem Statement

Question category: Knowledge.

## Considered Options

- **I know it — I'll share details** — You've already used or built for Junie IDE plugin and know the manifest, hook, and skills surfaces. Faster path — share what you know and I'll design against it.
- **Research it before designing** — I research Junie IDE plugin (docs, marketplace plugin format, any public hook API) before designing. Adds one round but I design against ground truth.
- **Design with assumptions, mark gaps** — Design now with the JetBrains plugin model as the assumed substrate (plugin.xml, extension points, application services), and call out anything that needs verification when implementation starts. Faster, but may need revisions.

## Decision Outcome

Chose **Research it before designing**. I research Junie IDE plugin (docs, marketplace plugin format, any public hook API) before designing. Adds one round but I design against ground truth.
