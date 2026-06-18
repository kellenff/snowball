#!/usr/bin/env node
"use strict";

const { spawn } = require("child_process");
const { resolveBundlePath, BundlePathNotFoundError } = require("./resolve-bundle-path.cjs");

let resolved;
try {
  resolved = resolveBundlePath({
    env: process.env.SNOWBALL_BUNDLE_DIR,
    dirname: __dirname,
  });
} catch (err) {
  if (err instanceof BundlePathNotFoundError) {
    process.stderr.write("snowball-capture: cannot locate dist/server.cjs\n");
    process.stderr.write(`  tried SNOWBALL_BUNDLE_DIR=${err.hints.env || "<unset>"}\n`);
    process.stderr.write(`  tried dirname=${err.hints.dirname || "<unset>"}\n`);
    process.exit(1);
  }
  throw err;
}

const child = spawn(process.execPath, [resolved.path, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

// Mirror the child's exit so the loader sees the real outcome.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
