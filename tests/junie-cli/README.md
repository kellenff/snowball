# Junie CLI tests

Lightweight, stdlib-only validation for the `.junie-extension/marketplace.json`
wiring that lets Junie CLI users discover and install the snowball extension.

- `validate-marketplace.sh` — asserts the marketplace JSON parses, every
  `extensions[].source` resolves to a real `extension.json` with `name` +
  `version`, and every MCP config is at the canonical `mcp/mcp.json` path
  with an `mcpServers` key.

Run from the repo root: `./tests/junie-cli/validate-marketplace.sh`.
Wired into pre-commit; runs on every change to the marketplace or the
extensions it points at.
