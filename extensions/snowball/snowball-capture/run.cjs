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

// Forward signals the loader sends us to the child. The child's eventual
// `exit` event will fire `process.exit` with its real code, so we don't
// exit the wrapper here — that would race and leave the child orphaned
// for a few ms after the parent dies. Signal-only forwarding is the
// race-free way.
for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    try {
      child.kill(sig);
    } catch {
      /* child already gone */
    }
  });
}

// Mirror the child's exit so the loader sees the real outcome.
child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});
