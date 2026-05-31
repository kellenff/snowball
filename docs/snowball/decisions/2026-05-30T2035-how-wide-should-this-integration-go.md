---
title: How wide should this integration go
status: accepted
date: '2026-05-30T20:35:25.481Z'
deciders:
  - kellen
snowball:
  schema_version: '1.0'
  source: operator
  confidence: high
  capture_mechanism: ask-user-question
  session_id: cb3b8037-cc0f-4bf3-9bc3-5e177d5a5348
  source_event_id: toolu_01GVSMrAZS581FH5kGu3KbNm
  supersedes: null
  tags:
    - ambient
---

# How wide should this integration go

## Context and Problem Statement

Question category: Scope.

## Considered Options

- **Brainstorming only** — Add the session-level offer + delegation only to the brainstorming skill. Smallest change, matches your original ask, YAGNI. Other skills can adopt the pattern later if it proves useful.
- **Brainstorming + debugging** — Also add an analogous hook to systematic-debugging, which already has a 'stuck after 2 hypotheses' point where a second-model perspective fits brain-jam's general use. Two skills, more consistent coverage, more to maintain.
- **Shared reference + brainstorming** — Put the detection check + offer wording in one small shared reference file, have brainstorming point to it. Avoids prose duplication if/when other skills adopt it. Slightly more upfront structure for a single consumer today.

## Decision Outcome

Chose **Brainstorming only**. Add the session-level offer + delegation only to the brainstorming skill. Smallest change, matches your original ask, YAGNI. Other skills can adopt the pattern later if it proves useful.
