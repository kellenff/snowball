# Cron automation

Snowball v6.7.0 ships the first Snowball-wide use of VTCode's `cron_create` primitive: nightly MADR digest refresh.

## How it works

1. At every VTCode `SessionStart`, the bootstrap script `on-session-start-cron.sh` runs.
2. The script writes a marker file at `.vtcode/.snowball-cron-state.json` if no cron named `snowball-madr-digest-refresh` is already registered.
3. The agent on its next turn reads the marker and issues `cron_create` using `scripts/cron-madr-digest.json` as the template.
4. VTCode fires the prompt nightly at 03:00 local; the prompt runs `scripts/refresh-adr-digest.sh`.
5. The digest at `.snowball/digest.txt` is updated atomically and consumed by `recalling-project-context` on the next cycle.

## Idempotency

`refresh-adr-digest.sh` is idempotent (only rewrites the digest when content changes). The bootstrap is idempotent (writes the marker only when no prior state exists). Re-running VTCode sessions never duplicates the cron.

## Disabling

Set `SNOWBALL_CRON=off` in the environment before invoking VTCode to skip the bootstrap entirely.
