# Pre-execution preset

**Loud:** action_risk
**Quiet:** change_scope, failure_impact (one-line each)

**Surface when:** `action_risk.level` >= SCHEMA `actionRisk.surfaceAt` (medium).

**Error policy:** when status is `error`, render "blast-radius unavailable" and recommend operator confirmation before proceeding.
