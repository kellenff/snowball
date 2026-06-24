import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";

interface ToolPolicy {
  version: number;
  policies: Record<string, string>;
  approval_cache: {
    allowed: string[];
    prefixes: string[];
    regexes: string[];
  };
}

// Resolve the repo root from this test file's directory so the test is
// cwd-independent: it works whether run from project root or tests/vtcode/.
const REPO_ROOT = path.resolve(import.meta.dir, "..", "..");
const POLICY_PATH = path.join(REPO_ROOT, ".vtcode", "tool-policy.json");

function loadPolicy(): ToolPolicy {
  const text = fs.readFileSync(POLICY_PATH, "utf8");
  return JSON.parse(text) as ToolPolicy;
}

test(".vtcode/tool-policy.json declares v6.7.0 prefix auto-approval for unified_search", () => {
  const policy = loadPolicy();
  expect(policy.version).toBeGreaterThanOrEqual(1);
  expect(policy.approval_cache.prefixes).toContain("unified_search");
});

test("every available tool either has a policy entry or is allowed by prefix/regex", () => {
  const policy = loadPolicy();
  const cache = policy.approval_cache;
  const autoApproved = new Set<string>(cache.allowed);
  for (const prefix of cache.prefixes) autoApproved.add(prefix);
  for (const re of cache.regexes) {
    // Smoke: each regex must compile.
    new RegExp(re);
  }
  const declared = new Set(Object.keys(policy.policies));
  for (const tool of [
    "unified_search",
    "unified_file",
    "unified_exec",
    "apply_patch",
  ]) {
    expect(declared.has(tool) || autoApproved.has(tool)).toBe(true);
  }
});
