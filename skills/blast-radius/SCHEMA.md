# Blast-Radius Schema

Canonical definitions for the status envelope, reason codes, thresholds, and heuristics. `compute.cjs` imports thresholds from `src/schema.ts` — keep this document and that module in sync.

## Status envelope

```json
{
  "status": "success | degraded | error",
  "backend": "graph | heuristic | none",
  "output": {
    "change_scope": { "fileCount", "files", "sharedInfraFileCount", "crossModuleEditCount", "level" },
    "failure_impact": { "estimatedFanOut", "sensitivePaths", "level" },
    "action_risk": { "level", "tags", "rationale" }
  },
  "reason": "ReasonCode | null"
}
```

- `success` + `graph` or `heuristic`: full output, no reason required.
- `degraded` + `heuristic`: partial output; `reason` explains the limitation (e.g. `graph-unavailable`).
- `error` + `none`: `output` is null; `reason` is required.

## Reason codes (closed enum)

| Code | When |
|---|---|
| `graph-unavailable` | codebase-memory CLI not reachable or disabled (`BLAST_RADIUS_DISABLE_GRAPH`) |
| `repo-not-indexed` | Project not in codebase-memory index |
| `change-untracked` | Requested paths have no git history / not in repo |
| `mcp-timeout` | Graph query timed out |
| `compute-error` | Internal bug or malformed input |
| `explicit-skip` | Operator asked to skip; `skipReason` captured in render banner |

## Risk levels

Three levels: `low`, `medium`, `high`. Used in each lens output and in preset "louder treatment" rules.

## Thresholds (Phase 1 defaults)

| Key | Value | Used for |
|---|---|---|
| `changeScope.mediumFiles` | 5 | change_scope.level |
| `changeScope.highFiles` | 12 | change_scope.level |
| `changeScope.decompositionFiles` | 8 | design gate decomposition flag |
| `changeScope.decompositionSharedInfra` | 3 | design gate decomposition flag |
| `changeScope.decompositionCrossModule` | 5 | design gate decomposition flag |
| `failureImpact.mediumFanOut` | 3 | failure_impact.level (heuristic estimate) |
| `failureImpact.highFanOut` | 8 | failure_impact.level |
| `actionRisk.surfaceAt` | `medium` | pre-execution gate surfaces to operator |

## Shared-infra file patterns

Glob-style prefixes (matched from repo root):

- `.pre-commit-config.yaml`
- `package.json`
- `tsconfig.json`
- `scripts/`
- `hooks/`

## Sensitive path patterns

- `hooks/`
- `skills/decision-logging/`
- `.pre-commit-config.yaml`

## Cross-module buckets

Count distinct buckets touched among: `skills/`, `tests/`, `hooks/`, `scripts/`, `docs/`. `crossModuleEditCount` = buckets − 1 (minimum 0).

## Action-risk rubric

Seeded from the system prompt's "Executing actions with care" list. Each matching rule adds a tag and may raise `action_risk.level`.

| Tag | Pattern (case-insensitive) | Default level |
|---|---|---|
| `destructive-shell` | `\brm\s+-rf\b`, `\bgit\s+push\s+--force\b`, `\bgit\s+reset\s+--hard\b`, `\bdrop\s+table\b`, `\btruncate\b` | high |
| `hard-to-reverse` | `\bmigrate\b.*\bdown\b`, `\bchmod\s+000\b`, `\bshred\b` | high |
| `shared-visible` | `\bgit\s+push\b`, `\bgh\s+pr\s+create\b`, `\bdeploy\b`, `\brelease\b` | medium |
| `third-party-upload` | `\bcurl\b.*\b(-d\|--data)\b`, `\bwget\b.*\b--post\b` | medium |
| `schema-change` | `\bdbmate\b`, `\bmigration\b`, `\bALTER\s+TABLE\b` | medium |

When multiple rules match, level = max(severity). Severity order: `low` < `medium` < `high`.

## Lens preset prominence

| Preset | Loud lenses | Quiet lenses |
|---|---|---|
| `design` | change_scope, failure_impact | action_risk |
| `pre-execution` | action_risk | change_scope, failure_impact (summarized) |
| `completion` | change_scope, failure_impact | action_risk (unless next action is push/force-push/release) |

## Scratch envelope path

`.snowball/blast-radius/last.json` — per-session, gitignored. Written on every successful `compute` invocation.

## Audit observation extension

When the audit hook fires (Stop or operator-approval phrase), it appends to `docs/snowball/decisions/observations.jsonl` with the standard observation fields plus:

| Field | Type | Description |
|---|---|---|
| `blast_radius_envelope` | status envelope object | Most recent envelope from `.snowball/blast-radius/last.json` |
| `capture_trigger` | `stop` \| `operator-approval` | Which hook event captured the envelope |

Operator-approval uses the same phrase matcher as `skills/decision-logging` (`approval-phrases.ts`). Phase 1 wiring: Claude Code (`hooks/hooks.json`) and Cursor (`hooks/hooks-cursor.json`) via `hooks/blast-radius-audit.sh`.
