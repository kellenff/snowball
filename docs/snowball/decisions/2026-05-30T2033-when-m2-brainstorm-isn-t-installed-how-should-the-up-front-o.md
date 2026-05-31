---
title: When m2-brainstorm isn't installed, how should the up-front offer behave
status: accepted
date: '2026-05-30T20:33:21.361Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: cb3b8037-cc0f-4bf3-9bc3-5e177d5a5348
  source_event_id: toolu_01NgwubrVXiUwMghjvZWdfAf
  supersedes: null
  tags:
    - ambient
---

# When m2-brainstorm isn't installed, how should the up-front offer behave

## Context and Problem Statement

Question category: Detection.

## Considered Options

- **Detect, skip silently** — Check for the m2-brainstorm CLI binary at session start. Only make the offer if it's present. Users without it never see a dangling, unusable option — matches how the self-contained Visual Companion behaves.
- **Always offer + install hint** — Surface the option for everyone. If not installed, briefly explain how to get it. More discoverable, but dangles a feature most snowball users can't use and couples a shipped skill's prose to an external plugin's install steps.
- **Detect via skill registry** — Check whether the m2-brainstorm:brain-jam skill is available (not the binary). Offer only if so. Cleaner separation (skill-to-skill, not skill-to-binary-path), but detection is fuzzier — no reliable way for a skill to enumerate other installed skills.

## Decision Outcome

Chose **Detect, skip silently**. Check for the m2-brainstorm CLI binary at session start. Only make the offer if it's present. Users without it never see a dangling, unusable option — matches how the self-contained Visual Companion behaves.
