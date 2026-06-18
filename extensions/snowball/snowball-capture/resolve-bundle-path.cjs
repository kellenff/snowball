"use strict";

const fs = require("fs");
const path = require("path");

class BundlePathNotFoundError extends Error {
  constructor(message, { hints }) {
    super(message);
    this.name = "BundlePathNotFoundError";
    this.hints = hints;
  }
}

function resolveBundlePath(hints, options) {
  const checkExists = options == null ? true : options.checkExists !== false;
  const env = hints == null ? undefined : hints.env;
  const dirname = hints == null ? undefined : hints.dirname;

  // Input-shape guard: dirname must be a string (or undefined) when the env
  // branch is unavailable. A non-string dirname is a programmer error, not a
  // runtime "I can't find the file" error, so we throw a TypeError.
  if (dirname !== undefined && typeof dirname !== "string") {
    throw new TypeError("dirname must be a string or undefined");
  }

  // 1. Try SNOWBALL_BUNDLE_DIR (bundle root -> <root>/snowball-capture/dist/server.cjs).
  if (env) {
    const candidate = path.join(env, "snowball-capture", "dist", "server.cjs");
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: "env" };
    }
  }

  // 2. Fall back to dirname (wrapper's directory -> <dirname>/dist/server.cjs).
  if (dirname) {
    const candidate = path.join(dirname, "dist", "server.cjs");
    if (!checkExists || fs.existsSync(candidate)) {
      return { path: candidate, source: "dirname" };
    }
  }

  throw new BundlePathNotFoundError("Cannot resolve snowball-capture server", {
    hints: { env, dirname },
  });
}

module.exports = { resolveBundlePath, BundlePathNotFoundError };
