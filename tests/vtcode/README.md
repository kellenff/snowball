# VTCode tests

Lightweight, stdlib-only validation for the VTCode harness adapter wiring
that lets VTCode users discover Snowball skills and pick up the
`using-snowball` bootstrap as project context.

- `validate-wiring.sh` — asserts the bootstrap mirror at `.vtcode/AGENTS.md`
  has a Snowball marker block, the tool mapping at
  `skills/using-snowball/references/vtcode-tools.md` covers the expected
  VTCode primitives, and the canonical `SKILL.md` mentions VTCode in the
  Platform Adaptation list.

Run from the repo root: `./tests/vtcode/validate-wiring.sh`.
Wired into pre-commit; runs on every change to the VTCode adapter files.
