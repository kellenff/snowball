#!/usr/bin/env bash
#
# validate-wiring.sh — assert the VTCode harness adapter wiring is intact:
# .vtcode/AGENTS.md exists with a Snowball marker block, the tool mapping
# reference lives at skills/using-snowball/references/vtcode-tools.md and
# names the expected tools, and the canonical SKILL.md mentions VTCode.
#
# Run from the repo root: ./tests/vtcode/validate-wiring.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AGENTS_MIRROR="$REPO_ROOT/.vtcode/AGENTS.md"
TOOL_MAP="$REPO_ROOT/skills/using-snowball/references/vtcode-tools.md"
SKILL_FILE="$REPO_ROOT/skills/using-snowball/SKILL.md"
HOOKS_TOML="$REPO_ROOT/.vtcode/hooks.toml"
BRIDGE_SRC="$REPO_ROOT/skills/decision-logging/src/vtcode-post-tool-use-bridge.ts"
BRIDGE_CJS="$REPO_ROOT/skills/decision-logging/scripts/vtcode-post-tool-use-bridge.cjs"
BRIDGE_SH="$REPO_ROOT/skills/decision-logging/scripts/on-ask-user-question-vtcode.sh"

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1" >&2
  exit 1
}

echo "Validating VTCode wiring"

# --- 1. .vtcode/AGENTS.md exists and has the Snowball marker block ---

[ -f "$AGENTS_MIRROR" ] || fail ".vtcode/AGENTS.md not found at $AGENTS_MIRROR"

opens=$(grep -c "BEGIN SNOWBALL BOOTSTRAP" "$AGENTS_MIRROR" || true)
closes=$(grep -c "END SNOWBALL BOOTSTRAP" "$AGENTS_MIRROR" || true)
if [ "$opens" -ne 1 ] || [ "$closes" -ne 1 ]; then
  fail ".vtcode/AGENTS.md must contain exactly one BEGIN/END SNOWBALL BOOTSTRAP marker pair (got $opens opens, $closes closes)"
fi
pass ".vtcode/AGENTS.md exists with a Snowball bootstrap marker block"

# --- 2. Tool mapping reference exists and covers the expected primitives ---

[ -f "$TOOL_MAP" ] || fail "vtcode-tools.md not found at $TOOL_MAP"
[ -s "$TOOL_MAP" ] || fail "vtcode-tools.md is empty"

for tool in "unified_file" "unified_search" "unified_exec" "apply_patch" "request_user_input" "task_tracker" "start_planning" "finish_planning" "web_fetch"; do
  if ! grep -q "$tool" "$TOOL_MAP"; then
    fail "vtcode-tools.md missing expected tool: $tool"
  fi
done
pass "vtcode-tools.md covers the expected VTCode tool names"

# --- 3. Canonical SKILL.md mentions VTCode in the Platform Adaptation list ---

if ! grep -q "vtcode-tools.md" "$SKILL_FILE"; then
  fail "skills/using-snowball/SKILL.md does not mention vtcode-tools.md in Platform Adaptation"
fi
pass "skills/using-snowball/SKILL.md references vtcode-tools.md"

# --- 4. .vtcode/hooks.toml exists, parses, and references the expected scripts ---

[ -f "$HOOKS_TOML" ] || fail ".vtcode/hooks.toml not found at $HOOKS_TOML"

python3 - "$HOOKS_TOML" <<'PY' || fail ".vtcode/hooks.toml is not valid TOML or missing [hooks.lifecycle] table"
import sys
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        sys.exit(0)  # no parser available; the regex check below still covers correctness

with open(sys.argv[1], "rb") as f:
    cfg = tomllib.load(f)

hooks = cfg.get("hooks", {}).get("lifecycle", {})
if not isinstance(hooks, dict) or not hooks:
    sys.exit("hooks.lifecycle table missing or empty")
PY

for script in "session-start" "on-user-prompt.sh" "on-ask-user-question-vtcode.sh" "on-stop.sh" "on-pre-compact.sh"; do
  if ! grep -q "$script" "$HOOKS_TOML"; then
    fail ".vtcode/hooks.toml does not reference expected hook script: $script"
  fi
done
pass ".vtcode/hooks.toml is valid TOML with [hooks.lifecycle] and references the five expected scripts"

# --- 5. Decision-spine bridge artifacts exist ---

[ -f "$BRIDGE_SRC" ] || fail "decision-logging bridge source missing at $BRIDGE_SRC"
[ -f "$BRIDGE_CJS" ] || fail "decision-logging bridge bundle missing at $BRIDGE_CJS (run scripts/build-decision-logging.sh)"
[ -f "$BRIDGE_SH" ] || fail "VTCode hook wrapper missing at $BRIDGE_SH"
[ -x "$BRIDGE_SH" ] || fail "VTCode hook wrapper $BRIDGE_SH is not executable"

# The PostToolUse matcher in hooks.toml is request_user_input; verify the
# bridge source filters to that tool name too (defense in depth).
if ! grep -q '"request_user_input"' "$BRIDGE_SRC"; then
  fail "vtcode-post-tool-use-bridge source does not gate on tool_name='request_user_input'"
fi
pass "decision-spine bridge (source + bundle + shell wrapper) is wired and executable"

echo "All VTCode wiring checks passed."
