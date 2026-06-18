#!/usr/bin/env bash
#
# validate-marketplace.sh — assert the .junie-extension/marketplace.json
# wiring is intact: the JSON parses, the schema fields are present, every
# extension `source` resolves to a real extension manifest, and the MCP
# config lives at the canonical mcp/mcp.json path.
#
# Run from the repo root: ./tests/junie-cli/validate-marketplace.sh
# Exits 0 on success, non-zero on the first failure.
#
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MARKETPLACE="$REPO_ROOT/.junie-extension/marketplace.json"

pass() { echo "  [PASS] $1"; }
fail() {
  echo "  [FAIL] $1" >&2
  exit 1
}

echo "Validating $MARKETPLACE"

# --- 1. Marketplace JSON parses and has the required top-level shape ---

[ -f "$MARKETPLACE" ] || fail "marketplace file not found at $MARKETPLACE"

python3 -m json.tool "$MARKETPLACE" >/dev/null \
  || fail "marketplace file is not valid JSON"

python3 - "$MARKETPLACE" <<'PY'
import json, sys
path = sys.argv[1]
with open(path, "r", encoding="utf-8") as f:
    m = json.load(f)

for field in ("name", "description", "extensions"):
    if field not in m:
        sys.exit(f"marketplace missing top-level field: {field}")

if not isinstance(m["extensions"], list) or not m["extensions"]:
    sys.exit("marketplace extensions[] must be a non-empty list")

for i, ext in enumerate(m["extensions"]):
    for field in ("name", "source"):
        if field not in ext:
            sys.exit(f"extensions[{i}] missing field: {field}")
PY
pass "marketplace JSON is valid and has required top-level fields"

# --- 2. Every extensions[i].source resolves to a real extension.json ---

python3 - "$MARKETPLACE" "$REPO_ROOT" <<'PY'
import json, os, sys
marketplace_path, repo_root = sys.argv[1], sys.argv[2]
with open(marketplace_path, "r", encoding="utf-8") as f:
    m = json.load(f)

marketplace_dir = os.path.dirname(marketplace_path)
for i, ext in enumerate(m["extensions"]):
    source = ext["source"]
    # Source paths are relative to the marketplace file's directory.
    if os.path.isabs(source):
        resolved = source
    else:
        resolved = os.path.normpath(os.path.join(marketplace_dir, source))
    manifest = os.path.join(resolved, "extension.json")
    if not os.path.isfile(manifest):
        sys.exit(f"extensions[{i}].source={source!r} does not resolve to extension.json ({manifest} missing)")
    with open(manifest, "r", encoding="utf-8") as f:
        man = json.load(f)
    for field in ("name", "version"):
        if field not in man:
            sys.exit(f"{manifest} missing field: {field}")
PY
pass "every extensions[].source resolves to a real extension.json with name + version"

# --- 3. MCP config is at mcp/mcp.json (not mcp/.mcp.json) and is valid ---

python3 - "$MARKETPLACE" "$REPO_ROOT" <<'PY'
import json, os, sys
marketplace_path, repo_root = sys.argv[1], sys.argv[2]
with open(marketplace_path, "r", encoding="utf-8") as f:
    m = json.load(f)

marketplace_dir = os.path.dirname(marketplace_path)
for i, ext in enumerate(m["extensions"]):
    source = ext["source"]
    if os.path.isabs(source):
        resolved = source
    else:
        resolved = os.path.normpath(os.path.join(marketplace_dir, source))
    mcp_canonical = os.path.join(resolved, "mcp", "mcp.json")
    if not os.path.isfile(mcp_canonical):
        sys.exit(f"extensions[{i}].source={source!r} missing canonical MCP config at {mcp_canonical}")
    with open(mcp_canonical, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    if "mcpServers" not in cfg:
        sys.exit(f"{mcp_canonical} missing mcpServers key")
PY
pass "MCP config present at mcp/mcp.json with mcpServers key for every extension"

echo "All marketplace checks passed."
