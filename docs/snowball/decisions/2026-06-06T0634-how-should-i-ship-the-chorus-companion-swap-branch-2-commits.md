---
title: How should I ship the chorus-companion-swap branch (2 commits ahead of main)
status: accepted
date: '2026-06-06T06:34:31.387Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 985b5bdd-8205-4ea1-8376-f7c0967acaeb
  source_event_id: toolu_01M35wUhcugQMxcQ7PCMyGMa
  supersedes: null
  tags:
    - ambient
---

# How should I ship the chorus-companion-swap branch (2 commits ahead of main)

## Context and Problem Statement

Question category: Ship how.

## Considered Options

- **Merge to main + push** — Fast-forward main onto this work and push to origin (`git@github.com:kellenff/snowball`). Matches this repo's direct-to-main history. Deletes the feature branch after.
- **Open a pull request** — Push the branch to origin and create a GitHub PR for review instead of landing on main directly. Keeps the branch alive.
- **Merge to main, no push** — Fast-forward main locally and delete the branch, but don't push to origin yet (you push later).

## Decision Outcome

Chose **Merge to main, no push**. Fast-forward main locally and delete the branch, but don't push to origin yet (you push later).
