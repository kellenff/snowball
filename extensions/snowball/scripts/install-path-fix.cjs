#!/usr/bin/env node
"use strict";

const path = require("path");
const fs = require("fs");

// Post-install rewriter. The wrapper's mcp/mcp.json ships with a relative
// path to the wrapper (../snowball-capture/run.cjs). Adapters that resolve
// relative paths against the config file's directory pick that up without
// help; adapters that resolve against CWD or that need an absolute path
// need this rewriter. Cross-platform (Node.js, not bash) so the same
// behavior ships on macOS, Linux, and Windows.
//
// The script does NOT import resolve-bundle-path.cjs: that resolver is
// for the wrapper to find the inner server, not for us to find the
// wrapper. The wrapper's location is fixed at <bundle-root>/snowball-
// capture/run.cjs and we know it via __dirname.

const configPath = path.join(__dirname, "..", "mcp", "mcp.json");

if (!fs.existsSync(configPath)) {
  process.stderr.write(`snowball install-path-fix: expected mcp.json at ${configPath}\n`);
  process.stderr.write("  after marketplace install, this path is relative to the install root\n");
  process.exit(1);
}

let config;
try {
  config = JSON.parse(fs.readFileSync(configPath, "utf8"));
} catch (err) {
  process.stderr.write(
    `snowball install-path-fix: failed to parse ${configPath}: ${err.message}\n`,
  );
  process.exit(1);
}

if (!config.mcpServers || !config.mcpServers["snowball-capture"]) {
  process.stderr.write(
    `snowball install-path-fix: no mcpServers["snowball-capture"] in ${configPath}\n`,
  );
  process.exit(1);
}

const entry = config.mcpServers["snowball-capture"];
const existingArgs = Array.isArray(entry.args) ? entry.args : [];
const wrapperPath = path.join(__dirname, "..", "snowball-capture", "run.cjs");

// Replace args[0] with the absolute path to the wrapper; preserve args[1..].
config.mcpServers["snowball-capture"] = {
  ...entry,
  args: [wrapperPath, ...existingArgs.slice(1)],
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
process.stdout.write(`snowball install-path-fix: rewrote ${configPath}\n`);
process.stdout.write(`  snowball-capture -> ${wrapperPath}\n`);
