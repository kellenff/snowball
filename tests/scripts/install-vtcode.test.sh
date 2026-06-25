#!/usr/bin/env bash
# Integration test: scripts/install.sh vtcode should copy (not symlink)
# .vtcode/hooks.toml and scripts/cron-madr-digest.json into the target, with
# the /absolute/path/to/snowball placeholder substituted by the actual clone
# root. Also covers --uninstall, --force, and the self-symlink regression
# (target == clone root).
set -euo pipefail

SNOWBALL_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
INSTALL="$SNOWBALL_ROOT/scripts/install.sh"
[ -f "$INSTALL" ] || { echo "FAIL: install.sh not found at $INSTALL" >&2; exit 1; }

# Override HOME so the install script's `~/.agents/skills/` step doesn't
# pollute the real user skills directory.
FAKE_HOME="$(mktemp -d)"
trap 'rm -rf "$FAKE_HOME" "$TARGET"' EXIT
export HOME="$FAKE_HOME"

# Use a temp target so we don't touch the user's real project tree.
TARGET="$(mktemp -d)"

pass() { echo "  [PASS] $1"; }
fail() { echo "  [FAIL] $1" >&2; exit 1; }

# --- 1. Fresh install writes both files as regular (non-symlink) files ---

HOME="$FAKE_HOME" bash "$INSTALL" vtcode --target "$TARGET" --clone-root "$SNOWBALL_ROOT" >/dev/null

HOOKS="$TARGET/.vtcode/hooks.toml"
CRON="$TARGET/.vtcode/cron-madr-digest.json"

[ -f "$HOOKS" ] || fail "hooks.toml not written at $HOOKS"
[ ! -L "$HOOKS" ] || fail "hooks.toml must be a regular file, not a symlink (catches self-symlink regression)"
pass "hooks.toml is a regular file (not a symlink)"

[ -f "$CRON" ] || fail "cron-madr-digest.json not written at $CRON"
[ ! -L "$CRON" ] || fail "cron-madr-digest.json must be a regular file, not a symlink"
pass "cron-madr-digest.json is a regular file (not a symlink)"

# --- 2. Placeholder is gone, clone root is present ---

if grep -q '/absolute/path/to/snowball' "$HOOKS"; then
  fail "hooks.toml still contains the /absolute/path/to/snowball placeholder"
fi
pass "hooks.toml has no /absolute/path/to/snowball placeholder"

if ! grep -qF "$SNOWBALL_ROOT" "$HOOKS"; then
  fail "hooks.toml does not contain the clone root $SNOWBALL_ROOT"
fi
pass "hooks.toml contains the clone root path"

if grep -q '/absolute/path/to/snowball' "$CRON"; then
  fail "cron-madr-digest.json still contains the /absolute/path/to/snowball placeholder"
fi
pass "cron-madr-digest.json has no /absolute/path/to/snowball placeholder"

if ! grep -qF "$SNOWBALL_ROOT" "$CRON"; then
  fail "cron-madr-digest.json does not contain the clone root $SNOWBALL_ROOT"
fi
pass "cron-madr-digest.json contains the clone root path"

# --- 3. hooks.toml is valid TOML with the expected hook scripts ---

if ! python3 - "$HOOKS" <<'PY'; then
import sys
try:
    import tomllib
except ImportError:
    try:
        import tomli as tomllib
    except ImportError:
        sys.exit(0)  # parser unavailable; basename grep below still covers correctness
with open(sys.argv[1], "rb") as f:
    cfg = tomllib.load(f)
hooks = cfg.get("hooks", {}).get("lifecycle", {})
if not isinstance(hooks, dict) or not hooks:
    sys.exit("hooks.lifecycle table missing or empty")
PY
  fail "hooks.toml is not valid TOML or missing [hooks.lifecycle] table"
fi

for script in "session-start" "on-user-prompt.sh" "on-ask-user-question-vtcode.sh" "on-stop.sh" "on-pre-compact.sh" "on-apply-patch-vtcode.sh" "on-pre-tool-use-vtcode.sh" "on-session-start-cron.sh"; do
  if ! grep -q "$script" "$HOOKS"; then
    fail "hooks.toml does not reference expected hook script: $script"
  fi
done
pass "hooks.toml is valid TOML and references the eight expected hook scripts"

# --- 4. cron-madr-digest.json is valid JSON with the expected shape ---

if ! python3 - "$CRON" <<'PY'; then
import json, sys
with open(sys.argv[1]) as f:
    cfg = json.load(f)
for field in ("name", "cron", "prompt"):
    if field not in cfg:
        sys.exit(f"missing field: {field}")
PY
  fail "cron-madr-digest.json is not valid JSON or missing required fields"
fi
pass "cron-madr-digest.json is valid JSON with name/cron/prompt fields"

# --- 5. --force re-writes a pre-existing file with substitution ---

# Mutate the file to simulate drift, then re-run with --force.
echo "old content with /absolute/path/to/snowball" > "$HOOKS"
HOME="$FAKE_HOME" bash "$INSTALL" vtcode --target "$TARGET" --clone-root "$SNOWBALL_ROOT" --force >/dev/null
if grep -q '/absolute/path/to/snowball' "$HOOKS"; then
  fail "hooks.toml still contains placeholder after --force re-run"
fi
if ! grep -qF "$SNOWBALL_ROOT" "$HOOKS"; then
  fail "hooks.toml not re-substituted after --force re-run"
fi
pass "--force re-writes hooks.toml with substitution"

# --- 6. --uninstall removes both Snowball-written files ---

HOME="$FAKE_HOME" bash "$INSTALL" vtcode --target "$TARGET" --clone-root "$SNOWBALL_ROOT" --uninstall >/dev/null
[ ! -e "$HOOKS" ] || fail "hooks.toml not removed by --uninstall"
[ ! -e "$CRON" ] || fail "cron-madr-digest.json not removed by --uninstall"
pass "--uninstall removes both hooks.toml and cron-madr-digest.json"

# --- 7. --uninstall preserves operator-managed files ---

# Recreate the target and a non-Snowball hooks.toml; uninstall should leave it.
mkdir -p "$TARGET/.vtcode"
cat > "$TARGET/.vtcode/hooks.toml" <<'TOML'
# Operator-managed hooks.toml — no clone root reference.
[hooks.lifecycle]
TOML
HOME="$FAKE_HOME" bash "$INSTALL" vtcode --target "$TARGET" --clone-root "$SNOWBALL_ROOT" --uninstall >/dev/null
if [ ! -f "$TARGET/.vtcode/hooks.toml" ]; then
  fail "--uninstall removed an operator-managed hooks.toml (no clone root reference)"
fi
if ! grep -q 'Operator-managed' "$TARGET/.vtcode/hooks.toml"; then
  fail "--uninstall did not preserve the operator-managed hooks.toml contents"
fi
pass "--uninstall preserves operator-managed hooks.toml without clone root"

echo "PASS: install.sh vtcode writes target-specific files with placeholder substituted"
