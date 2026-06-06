---
title: >-
  Beyond the brainstorming skill itself, live m2/MiniMax descriptions exist in docs/design/snowball-process.md and a
  README changelog. Should I update those for repo consistency
status: accepted
date: '2026-06-06T06:21:47.472Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 985b5bdd-8205-4ea1-8376-f7c0967acaeb
  source_event_id: toolu_015tnM8jofm6wpLxbD29egyW
  supersedes: null
  tags:
    - ambient
---

# Beyond the brainstorming skill itself, live m2/MiniMax descriptions exist in docs/design/snowball-process.md and a README changelog. Should I update those for repo consistency

## Context and Problem Statement

Question category: Doc scope.

## Considered Options

- **Process doc + new changelog row** — Rewrite the snowball-process.md companion description to chorus and add a new README changelog row for the swap (leaving the historical v5.3.0 row intact). Keeps repo docs consistent with the rewired skill.
- **Process doc only** — Update the snowball-process.md description to chorus; leave the README changelog untouched.
- **Skill file only** — Match the recorded scope exactly — change only skills/brainstorming/SKILL.md. Leave the process doc and README as-is (they'll describe the old behavior).

## Decision Outcome

Chose **Process doc + new changelog row**. Rewrite the snowball-process.md companion description to chorus and add a new README changelog row for the swap (leaving the historical v5.3.0 row intact). Keeps repo docs consistent with the rewired skill.
