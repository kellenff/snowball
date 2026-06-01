---
title: >-
  MiniMax reframed the telemetry as Stage 1 of a funnel (rank candidates) with a separate Stage 2 (naive-alternative
  reducibility test) as the real port decision. How far does this project go
status: accepted
date: '2026-06-01T05:54:29.766Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: 71a11894-7f52-4d70-ba1c-d3c74c656d72
  source_event_id: toolu_01GEnSPi8FBvEPRtafP7k6JX
  supersedes: null
  tags:
    - ambient
---

# MiniMax reframed the telemetry as Stage 1 of a funnel (rank candidates) with a separate Stage 2 (naive-alternative reducibility test) as the real port decision. How far does this project go

## Context and Problem Statement

Question category: Scope.

## Considered Options

- **Triage telemetry only (Stage 1)** — Build just the OTel/Grafana layer that ranks skills by volume × token-cost × reliability proxies, surfacing the top 5–10 port candidates. You run the naive-alternative test by hand, later, on whatever it surfaces. Smallest, ships fast, matches your original ask — now correctly framed as a funnel mouth, not a verdict.
- **Full funnel (Stage 1 + Stage 2)** — Telemetry triage PLUS a reproducible naive-alternative harness: fixed input corpus per candidate, parity scoring, failure-category tagging, calibrated LLM-judge. This is the thing that actually decides ports — but it's a substantially bigger build and a second spec.
- **Triage telemetry, Stage 2 designed but deferred** — Build Stage 1 now; write Stage 2's contract (what the harness consumes from telemetry, the parity/failure-tag schema) into the spec as a documented seam, implement later. Keeps the funnel coherent without committing to the bigger build yet.

## Decision Outcome

Chose **Full funnel (Stage 1 + Stage 2)**. Telemetry triage PLUS a reproducible naive-alternative harness: fixed input corpus per candidate, parity scoring, failure-category tagging, calibrated LLM-judge. This is the thing that actually decides ports — but it's a substantially bigger build and a second spec.
