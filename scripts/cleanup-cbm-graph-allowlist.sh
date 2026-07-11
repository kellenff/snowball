#!/bin/bash
# Remove the codebase-memory-mcp graph-tool entries from a Claude Code local
# allowlist. Idempotent: re-running leaves the file unchanged once the entries
# are gone.
#
# Usage:
#   bash scripts/cleanup-cbm-graph-allowlist.sh               # ~/.claude/settings.local.json
#   bash scripts/cleanup-cbm-graph-allowlist.sh <path>       # explicit path
#
# Ref: docs/snowball/specs/2026-07-10-yactt-graph-backend-design.md

set -euo pipefail

target="${1:-${HOME}/.claude/settings.local.json}"

if [[ ! -f "$target" ]]; then
  echo "no local allowlist at $target — nothing to clean." >&2
  exit 0
fi

# Entries that are now yactt-only. manage_adr and delete_project stay because
# the ADR side is still on codebase-memory until the follow-up MADR ships.
stale=(
  "mcp__codebase-memory-mcp__list_projects"
  "mcp__codebase-memory-mcp__search_graph"
  "mcp__codebase-memory-mcp__search_code"
  "mcp__codebase-memory-mcp__get_code_snippet"
  "mcp__codebase-memory-mcp__index_repository"
  "mcp__codebase-memory-mcp__get_architecture"
  "mcp__codebase-memory-mcp__index_status"
  "mcp__codebase-memory-mcp__query_graph"
)

# Use Python for safe JSON edit (jq would also work but we keep deps tight).
python3 - "$target" "${stale[@]}" <<'PYEOF'
import json, sys, pathlib, shutil
target = sys.argv[1]
stale = set(sys.argv[2:])
path = pathlib.Path(target)
data = json.loads(path.read_text())
allow = data.get("permissions", {}).get("allow", [])
before = len(allow)
allow = [e for e in allow if e not in stale]
after = len(allow)
if before == after:
    print(f"{target}: no stale entries — nothing to do.")
    sys.exit(0)
data.setdefault("permissions", {})["allow"] = allow
# Atomic write: tmp file → rename.
tmp = path.with_suffix(".local.json.tmp")
tmp.write_text(json.dumps(data, indent=2) + "\n")
shutil.move(str(tmp), str(target))
print(f"{target}: removed {before - after} codebase-memory graph-tool entries.")
print("Kept: mcp__codebase-memory-mcp__manage_adr and mcp__codebase-memory-mcp__delete_project")
print("      (ADR layer still routes through codebase-memory until a follow-up MADR lands.)")
PYEOF
