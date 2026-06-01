---
title: >-
  Snowball is cross-harness, but the measurement seam (hooks + a token-bearing transcript) is richest in Claude Code.
  How wide should the first cut be
status: accepted
date: '2026-06-01T05:42:12.881Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 71a11894-7f52-4d70-ba1c-d3c74c656d72
  source_event_id: toolu_01B63HquyedPnMC2fWrfgKPh
  supersedes: null
  tags:
    - ambient
---

# Snowball is cross-harness, but the measurement seam (hooks + a token-bearing transcript) is richest in Claude Code. How wide should the first cut be

## Context and Problem Statement

Question category: Harness scope.

## Considered Options

- **CC-first, portable boundary** — Instrument Claude Code (richest transcript, per-turn token usage), but keep the capture→emit boundary harness-agnostic so Cursor/Codex plug in later. Matches your 'ship hooks where the rail is proven' philosophy. Recommended.
- **All harnesses now** — Instrument CC, Cursor, Codex, OpenCode together. Maximum coverage, but each exposes different signal — some may not surface token usage at all — multiplying work and producing uneven, hard-to-compare data.
- **CC only, ignore portability** — Simplest. Answer the port question from CC data alone and don't carry any cross-harness abstraction. Fastest to a result; you'd retrofit other harnesses later if ever.

## Decision Outcome

Chose **CC-first, portable boundary**. Instrument Claude Code (richest transcript, per-turn token usage), but keep the capture→emit boundary harness-agnostic so Cursor/Codex plug in later. Matches your 'ship hooks where the rail is proven' philosophy. Recommended.
