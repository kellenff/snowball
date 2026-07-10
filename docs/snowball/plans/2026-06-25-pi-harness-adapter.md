# Pi Harness Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add pi as a first-class supported harness. Snowball ships as a pi package (`pi install git:github.com/kellenff/snowball`); the bundled TypeScript extension injects the bootstrap, registers skills via `resources_discover`, and wires approval-phrase MADRs + blast-radius audits + extraction-worker forks.

**Architecture:** Mirror the opencode plugin's pattern in pi's extension API. Reuse the existing CJS capture bundles (`blast-radius-audit.cjs`, `user-prompt-bridge.cjs`, `extract-worker.sh`) — single source of truth across harnesses. Add a `pi-session-reader.ts` that serializes pi's session JSONL tree to the flat format the existing extract-worker.sh already consumes. Ship a `pi-tools.md` mapping reference. Decision spine partial: no `AskUserQuestion` analog in pi.

**Tech Stack:** TypeScript (jiti-loaded by pi), `@earendil-works/pi-coding-agent` types, `typebox` (already a dependency), bun test runner for the extension smoke tests.

---

## File Structure

**Created:**

- `extensions/pi/snowball.ts` — TypeScript extension entry; subscribes to five events.
- `skills/decision-logging/scripts/pi-session-reader.ts` — serializes pi's session JSONL tree to flat `{role, content}` JSONL. Reuses `extract-worker.sh` unchanged.
- `skills/using-snowball/references/pi-tools.md` — Claude Code → pi tool-name mapping reference.
- `tests/pi/extension.test.ts` — bun test file, stubbed ExtensionAPI, 11 assertions.
- `tests/pi/fixtures/snowball-bootstrap/SKILL.md` — minimal `using-snowball/SKILL.md` copy the test reads.
- `tests/pi/fixtures/sample-session.jsonl` — sample pi session for the pi-session-reader tests.
- `tests/pi/README.md` — one-paragraph doc.

**Modified:**

- `package.json` — add `"keywords": ["pi-package"]`.
- `.version-bump.json` — no change.
- `skills/using-snowball/SKILL.md` — add pi paragraph to "How to Access Skills" and "Platform Adaptation".
- `README.md` — add pi row to per-harness table; add Setup bullet; soften "Not on any plugin marketplace" line to carve out pi.
- `RELEASE-NOTES.md` — entry noting pi harness entry, decision-spine partial, new files.
- All version-bearing manifests (per `.version-bump.json`) — bumped via `scripts/bump-version.sh <next>`.

**Not touched:**

- `extensions/snowball/` (Junie bundle), `.opencode/plugins/snowball.js`, `hooks/` (the CJS bundles are reused unchanged).

---

## Task 1: Scaffold the pi package manifest on the root package.json

> **Note (post-review fix):** The original Task 1 created `extensions/pi/package.json` to hold the `pi` block. Code review caught that `pi install git:github.com/kellenff/snowball` installs the repo root, and pi's auto-discovery of conventional directories is one level deep (it would miss `extensions/pi/*.ts`). The `pi` block belongs on the **root** `package.json`, with paths relative to the repo root. No sub-package.json is needed. The fixup commit `2655104` reflects the corrected design.

**Files:**
- Modify: `package.json` (add `keywords` and `pi` block)

- [ ] **Step 1: Add `keywords` and `pi` block to the root `package.json`**

Add two fields to the existing root `package.json` (which already has `name`, `version`, `type`, etc.):

```json
{
  "name": "snowball",
  "version": "6.6.0",
  "keywords": ["pi-package"],
  "pi": {
    "extensions": ["./extensions/pi/snowball.ts"],
    "skills": ["./skills"]
  },
  ...
}
```

Both new fields go alongside the existing ones. The `pi` block tells pi where to find the extension entry point and the skill paths; paths are relative to the package root, which is the repo root for `pi install git:github.com/kellenff/snowball`.

Pi bundles `@earendil-works/pi-coding-agent` and `typebox` at runtime; do not declare them as dependencies of the root package.

- [ ] **Step 2: Verify the JSON parses and the new fields are correct**

Run:
```bash
node -e "JSON.parse(require('fs').readFileSync('package.json','utf8'))"
node -e "console.log(JSON.stringify(require('./package.json').pi))"
```

Expected: first command exits 0 with no output; second prints `{"extensions":["./extensions/pi/snowball.ts"],"skills":["./skills"]}`.

- [ ] **Step 3: Commit**

```bash
git add package.json
git commit -m "feat(pi): scaffold pi package manifest on root package.json

The pi block lives on the root package.json (which is what
'pi install git:github.com/kellenff/snowball' installs) with paths
relative to the repo root. Pi's auto-discovery of conventional
directories is one level deep; without the explicit manifest the
extensions/pi/snowball.ts entry point would never load.

Also adds 'pi-package' keyword for npm discoverability."
```

---

## Task 2: Implement `pi-session-reader.ts` with TDD

**Files:**
- Create: `tests/pi/fixtures/sample-session.jsonl`
- Create: `tests/pi/fixtures/expected-transcript.jsonl`
- Create: `tests/pi/session-reader.test.ts`
- Create: `skills/decision-logging/scripts/pi-session-reader.ts`

- [ ] **Step 1: Write the test fixture (a minimal pi session JSONL tree)**

Create `tests/pi/fixtures/sample-session.jsonl` with three entries (user → assistant → toolResult) forming a single-branch chain:

```jsonl
{"id":"e1","parentId":null,"type":"message","timestamp":1700000000000,"message":{"role":"user","content":[{"type":"text","text":"What is 2+2?"}]}}
{"id":"e2","parentId":"e1","type":"message","timestamp":1700000001000,"message":{"role":"assistant","content":[{"type":"text","text":"4"}]}}
{"id":"e3","parentId":"e2","type":"message","timestamp":1700000002000,"message":{"role":"toolResult","content":[{"type":"text","text":"bash exit 0"}]}}
```

- [ ] **Step 2: Write the expected flat-transcript output**

Create `tests/pi/fixtures/expected-transcript.jsonl`:

```jsonl
{"role":"user","content":"What is 2+2?"}
{"role":"assistant","content":"4"}
{"role":"toolResult","content":"bash exit 0"}
```

- [ ] **Step 3: Write the failing test**

Create `tests/pi/session-reader.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { serializePiSession } from "../../skills/decision-logging/scripts/pi-session-reader";

const fixtures = join(import.meta.dir, "fixtures");
const sessionFile = join(fixtures, "sample-session.jsonl");
const expectedFile = join(fixtures, "expected-transcript.jsonl");

describe("serializePiSession", () => {
  test("converts a single-branch session to flat {role, content} JSONL", () => {
    const result = serializePiSession(sessionFile);
    const expected = readFileSync(expectedFile, "utf8");
    expect(result).toBe(expected);
  });

  test("returns empty string for an empty session", () => {
    const emptyFile = join(fixtures, "empty-session.jsonl");
    const result = serializePiSession(emptyFile);
    expect(result).toBe("");
  });

  test("skips image-only entries", () => {
    const imageOnlyFile = join(fixtures, "image-only-session.jsonl");
    const result = serializePiSession(imageOnlyFile);
    expect(result).toBe("");
  });
});
```

- [ ] **Step 4: Create the empty + image-only fixtures**

```bash
> tests/pi/fixtures/empty-session.jsonl
```

For `image-only-session.jsonl`:

```jsonl
{"id":"e1","parentId":null,"type":"message","timestamp":1700000000000,"message":{"role":"user","content":[{"type":"image","source":{"type":"base64","mediaType":"image/png","data":"..."}}]}}
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `bun test tests/pi/session-reader.test.ts`
Expected: FAIL with `Cannot find module '../../skills/decision-logging/scripts/pi-session-reader'` or similar (the module does not exist yet).

- [ ] **Step 6: Implement `serializePiSession`**

Create `skills/decision-logging/scripts/pi-session-reader.ts`:

```typescript
import { readFileSync } from "node:fs";

type PiEntry = {
  id: string;
  parentId: string | null;
  type: string;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
};

const flattenText = (content: PiEntry["message"]["content"]): string => {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
};

const walkBranch = (entries: PiEntry[]): PiEntry[] => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const childByParent = new Map<string | null, PiEntry[]>();
  for (const entry of entries) {
    const arr = childByParent.get(entry.parentId) ?? [];
    arr.push(entry);
    childByParent.set(entry.parentId, arr);
  }
  // Pi session files are typically written in chronological order; the active
  // branch is the last entry whose parentId is null (the root) plus the chain
  // ending at the leaf. We walk from the last root forward via parentId.
  const leaf = entries[entries.length - 1];
  if (!leaf) return [];
  const chain: PiEntry[] = [];
  let cursor: PiEntry | undefined = leaf;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  return chain;
};

export const serializePiSession = (sessionFilePath: string): string => {
  const raw = readFileSync(sessionFilePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries = lines.map((l) => JSON.parse(l) as PiEntry);
  const branch = walkBranch(entries);
  const out: string[] = [];
  for (const entry of branch) {
    const role = entry.message?.role;
    const text = flattenText(entry.message?.content);
    if (!role || !text) continue;
    out.push(JSON.stringify({ role, content: text }));
  }
  return out.join("\n") + (out.length ? "\n" : "");
};
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `bun test tests/pi/session-reader.test.ts`
Expected: 3 passing, 0 failing.

- [ ] **Step 8: Commit**

```bash
git add skills/decision-logging/scripts/pi-session-reader.ts tests/pi/session-reader.test.ts tests/pi/fixtures/
git commit -m "feat(pi): pi-session-reader serializes session JSONL to flat transcript

Reuses the existing extract-worker.sh unchanged — same flat {role, content}
JSONL format the opencode plugin produces. Single source of truth across
harnesses for the extraction worker input."
```

---

## Task 3: Write pi extension smoke tests (failing)

**Files:**
- Create: `tests/pi/fixtures/snowball-bootstrap/SKILL.md`
- Create: `tests/pi/extension.test.ts`

- [ ] **Step 1: Create the bootstrap fixture**

Copy a minimal `using-snowball/SKILL.md` for the test to read:

```bash
mkdir -p tests/pi/fixtures/snowball-bootstrap
cp skills/using-snowball/SKILL.md tests/pi/fixtures/snowball-bootstrap/SKILL.md
```

- [ ] **Step 2: Write the extension smoke test**

Create `tests/pi/extension.test.ts`:

```typescript
import { describe, test, expect, beforeEach } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

type Handler = (event: any, ctx: any) => any | Promise<any>;

const makePi = () => {
  const handlers = new Map<string, Handler>();
  const api = {
    on(event: string, handler: Handler) {
      handlers.set(event, handler);
    },
  };
  return {
    api,
    invoke: (event: string, ev: any = {}, ctx: any = {}) =>
      handlers.get(event)?.(ev, ctx),
  };
};

// Build a tmp dir containing a fake repo root with the bootstrap SKILL.md and
// the three CJS bundle paths the extension loads.
const buildFixtureRepo = (): string => {
  const repo = mkdtempSync(join(tmpdir(), "snowball-pi-test-"));
  execSync("git init -q", { cwd: repo });
  // Mirror the path layout the extension expects.
  const skillDir = join(repo, "skills/using-snowball");
  // Use the fixture SKILL.md the previous step copied.
  execSync(`mkdir -p "${skillDir}"`);
  execSync(`cp -R tests/pi/fixtures/snowball-bootstrap/. "${skillDir}/"`);

  // Drop minimal stubs for the CJS bundles so loadCapture() succeeds without
  // pulling the full source tree. The stubs record calls.
  const hooksDir = join(repo, "hooks");
  const decisionDir = join(repo, "skills/decision-logging/scripts");
  execSync(`mkdir -p "${hooksDir}" "${decisionDir}"`);

  writeFileSync(
    join(hooksDir, "blast-radius-audit.cjs"),
    `module.exports = { captureBlastRadiusAudit: (i) => globalThis.__captured?.push({ kind: "blast", ...i }) };`,
  );
  writeFileSync(
    join(decisionDir, "user-prompt-bridge.cjs"),
    `module.exports = { handleUserPromptApproval: (i) => globalThis.__captured?.push({ kind: "approval", ...i }) };`,
  );
  writeFileSync(
    join(decisionDir, "extract-worker.sh"),
    `#!/bin/bash\necho "$@" >> "$SNOWBALL_TRANSCRIPT_OUT"\nexit 0\n`,
  );
  execSync(`chmod +x ${join(decisionDir, "extract-worker.sh")}`);

  return repo;
};

// Re-point REPO_ROOT-derived paths inside the extension to the test repo by
// patching import.meta.url via a wrapper. We import the extension by file URL
// after rewriting the file's REPO_ROOT path with a tiny shim.
const importExtensionForRepo = async (repo: string) => {
  // Read the source, replace the REPO_ROOT constant, write to a tmp file.
  const src = await Bun.file("extensions/pi/snowball.ts").text();
  const patched = src.replace(
    /const REPO_ROOT = path\.resolve\(here, "\.\.\/\.\."\);/,
    `const REPO_ROOT = ${JSON.stringify(repo)};`,
  );
  const tmp = join(repo, "_extension-under-test.ts");
  await Bun.write(tmp, patched);
  return import(tmp);
};

describe("snowball pi extension", () => {
  let repo: string;
  let captured: any[];
  let spawnCalls: string[][];
  let originalSpawn: typeof import("node:child_process").spawn;

  beforeEach(async () => {
    repo = buildFixtureRepo();
    captured = [];
    spawnCalls = [];
    (globalThis as any).__captured = captured;

    // Replace child_process.spawn with a stub that records the args.
    originalSpawn = (await import("node:child_process")).spawn;
    (await import("node:child_process")).spawn = ((...args: any[]) => {
      spawnCalls.push(args.map(String));
      return { unref: () => {} } as any;
    }) as any;

    // Env var the test stub extract-worker.sh reads.
    process.env.SNOWBALL_TRANSCRIPT_OUT = join(repo, "extract.log");
  });

  test("bootstrap injected on first before_agent_start", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const result = await pi.invoke("before_agent_start", { systemPrompt: "BASE" });
    expect(result.systemPrompt).toStartWith("BASE");
    expect(result.systemPrompt).toContain("<EXTREMELY_IMPORTANT>");
    expect(result.systemPrompt).toContain("using-snowball");
  });

  test("bootstrap not re-injected on second call", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    await pi.invoke("before_agent_start", { systemPrompt: "BASE" });
    const second = await pi.invoke("before_agent_start", { systemPrompt: "BASE2" });
    expect(second).toBeUndefined();
  });

  test("bootstrap missing → no injection", async () => {
    // Remove the SKILL.md fixture and re-import.
    rmSync(join(repo, "skills/using-snowball/SKILL.md"));
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const result = await pi.invoke("before_agent_start", { systemPrompt: "BASE" });
    expect(result).toBeUndefined();
  });

  test("approval phrase triggers capture", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "looks good", source: "interactive" }, ctx);
    expect(captured).toContainEqual(
      expect.objectContaining({ kind: "approval", prompt: "looks good" }),
    );
    expect(captured).toContainEqual(
      expect.objectContaining({ kind: "blast", trigger: "operator-approval" }),
    );
  });

  test("non-approval text skipped", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "explain this code", source: "interactive" }, ctx);
    expect(captured).toHaveLength(0);
  });

  test("non-interactive source skipped", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "looks good", source: "rpc" }, ctx);
    expect(captured).toHaveLength(0);
  });

  test("session_shutdown fires stop audit + extraction", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("session_shutdown", { reason: "quit" }, ctx);
    expect(captured).toContainEqual(expect.objectContaining({ kind: "blast", trigger: "stop" }));
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
    expect(spawnCalls[0].join(" ")).toContain("extract-worker.sh");
  });

  test("session_compact fires extraction only", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("session_compact", { reason: "manual" }, ctx);
    expect(captured).toHaveLength(0);
    expect(spawnCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("resources_discover returns skill paths", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const result = await pi.invoke("resources_discover", { reason: "startup" });
    expect(result.skillPaths).toEqual([join(repo, "skills")]);
  });

  test("capture unavailable → no throw", async () => {
    // Wipe the CJS bundles; capture should no-op, resources_discover still works.
    rmSync(join(repo, "hooks/blast-radius-audit.cjs"));
    rmSync(join(repo, "skills/decision-logging/scripts/user-prompt-bridge.cjs"));
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    // Should not throw.
    await pi.invoke("input", { text: "looks good", source: "interactive" }, ctx);
    await pi.invoke("session_shutdown", { reason: "quit" }, ctx);
    expect(captured).toHaveLength(0);
  });

  test("shutdown extraction failure swallowed", async () => {
    (await import("node:child_process")).spawn = (() => {
      throw new Error("boom");
    }) as any;
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await expect(
      pi.invoke("session_shutdown", { reason: "quit" }, ctx),
    ).resolves.toBeUndefined();
  });

  afterEach(async () => {
    if (originalSpawn) {
      (await import("node:child_process")).spawn = originalSpawn;
    }
    rmSync(repo, { recursive: true, force: true });
    delete process.env.SNOWBALL_TRANSCRIPT_OUT;
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun test tests/pi/extension.test.ts`
Expected: FAIL (every test) because `extensions/pi/snowball.ts` does not exist yet. The import will throw `Cannot find module`.

- [ ] **Step 4: Commit the failing tests**

```bash
git add tests/pi/
git commit -m "test(pi): failing extension smoke tests

Eleven assertions covering bootstrap injection, approval-phrase capture,
session_shutdown / session_compact extraction wiring, resources_discover,
and error-handling degradation. All fail because extensions/pi/snowball.ts
does not exist yet."
```

---

## Task 4: Implement bootstrap injection

**Files:**
- Create: `extensions/pi/snowball.ts`

- [ ] **Step 1: Write the extension scaffold (file exists, bootstrap injection only)**

Create `extensions/pi/snowball.ts` with just the bootstrap injection wired up (other handlers come in Tasks 5-6). The scaffold must satisfy the bootstrap-related tests from Task 3.

```typescript
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const SKILL_BOOTSTRAP_PATH = path.join(REPO_ROOT, "skills/using-snowball/SKILL.md");
const SKILL_PATHS = [path.join(REPO_ROOT, "skills")];

let _bootstrapCache: string | null | undefined;

const stripFrontmatter = (content: string): string => {
  const match = content.match(/^---\n[\s\S]*?\n---\n([\s\S]*)$/);
  return match ? match[1] : content;
};

const getBootstrap = (): string | null => {
  if (_bootstrapCache !== undefined) return _bootstrapCache;
  if (!existsSync(SKILL_BOOTSTRAP_PATH)) {
    _bootstrapCache = null;
    return null;
  }
  const body = stripFrontmatter(readFileSync(SKILL_BOOTSTRAP_PATH, "utf8"));
  _bootstrapCache = `<EXTREMELY_IMPORTANT>
You have snowball skills loaded.

The using-snowball skill content follows. You are already following it; do NOT call a Skill tool to load "using-snowball" again — that would be redundant.

${body}
</EXTREMELY_IMPORTANT>`;
  return _bootstrapCache;
};

export default function (pi: ExtensionAPI) {
  let bootstrapInjected = false;

  pi.on("resources_discover", () => ({ skillPaths: SKILL_PATHS }));

  pi.on("before_agent_start", (event) => {
    if (bootstrapInjected) return;
    const bootstrap = getBootstrap();
    if (!bootstrap) return;
    bootstrapInjected = true;
    return { systemPrompt: `${event.systemPrompt}\n\n${bootstrap}` };
  });
}
```

- [ ] **Step 2: Run the bootstrap-related tests**

Run: `bun test tests/pi/extension.test.ts -t "bootstrap"`
Expected: 3 passing (injected, not re-injected, missing), 8 still failing (the rest).

- [ ] **Step 3: Commit**

```bash
git add extensions/pi/snowball.ts
git commit -m "feat(pi): bootstrap injection in extensions/pi/snowball.ts

Reads skills/using-snowball/SKILL.md once, strips frontmatter, wraps in
<EXTREMELY_IMPORTANT> framing, and injects into the system prompt on the
first before_agent_start per session. resources_discover registers the
skills path for pi's auto-discovery."
```

---

## Task 5: Implement input event handler (approval-phrase capture)

**Files:**
- Modify: `extensions/pi/snowball.ts` (add input handler + capture loader)

- [ ] **Step 1: Add the CJS capture loader**

Append the loader to `extensions/pi/snowball.ts` (top, after the existing constants):

```typescript
import { createRequire } from "node:module";
const requireCjs = createRequire(import.meta.url);

const BLAST_RADIUS_AUDIT_CJS = path.join(REPO_ROOT, "hooks/blast-radius-audit.cjs");
const USER_PROMPT_BRIDGE_CJS = path.join(REPO_ROOT, "skills/decision-logging/scripts/user-prompt-bridge.cjs");

type Capture = {
  handleUserPromptApproval: (input: { prompt: string; sessionId: string; gitRoot: string | null }) => void;
  captureBlastRadiusAudit: (input: { gitRoot: string | null; sessionId: string; trigger: string; prompt?: string }) => void;
};

let _capture: Capture | null | undefined;
const loadCapture = (): Capture | null => {
  if (_capture !== undefined) return _capture;
  try {
    const audit = requireCjs(BLAST_RADIUS_AUDIT_CJS);
    const prompt = requireCjs(USER_PROMPT_BRIDGE_CJS);
    _capture = {
      handleUserPromptApproval: prompt.handleUserPromptApproval,
      captureBlastRadiusAudit: audit.captureBlastRadiusAudit,
    };
  } catch {
    _capture = null;
  }
  return _capture;
};
```

- [ ] **Step 2: Add `findGitRoot` and `looksLikeApproval` helpers**

Append:

```typescript
import { execSync } from "node:child_process";

const findGitRoot = (cwd: string): string | null => {
  try {
    return execSync("git rev-parse --show-toplevel", { cwd, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim() || null;
  } catch {
    return null;
  }
};

// Matches the canonical approval phrases the opencode plugin's
// user-prompt-bridge uses. Kept inline (not bundled) because the bridge's
// own matching is the source of truth — this is just the gate.
const APPROVAL_RE = /^(lgtm|looks good|ship it|approved?|go ahead|do it|yes,? do it|that works)\b/i;

const looksLikeApproval = (text: string): boolean => APPROVAL_RE.test(text.trim());
```

- [ ] **Step 3: Add the `input` handler inside the factory**

Insert inside the factory function, before the closing brace:

```typescript
  pi.on("input", (event, ctx) => {
    if (event.source !== "interactive") return;
    if (!looksLikeApproval(event.text)) return;
    try {
      const cap = loadCapture();
      if (!cap) return;
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      cap.handleUserPromptApproval({ prompt: event.text, sessionId, gitRoot });
      cap.captureBlastRadiusAudit({ gitRoot, sessionId, trigger: "operator-approval", prompt: event.text });
    } catch {
      // never block the input path
    }
    return { action: "continue" };
  });
```

- [ ] **Step 4: Run the input-related tests**

Run: `bun test tests/pi/extension.test.ts -t "input\|approval\|non-approval\|non-interactive\|capture unavailable"`
Expected: 4 passing (approval, non-approval, non-interactive, capture unavailable), 4 still failing (session_shutdown, session_compact tests).

- [ ] **Step 5: Commit**

```bash
git add extensions/pi/snowball.ts
git commit -m "feat(pi): input event approval-phrase capture

Reuses the existing user-prompt-bridge.cjs and blast-radius-audit.cjs
bundles the opencode plugin loads. Captures only on interactive source
text matching the canonical approval-phrase regex. Best-effort: any
failure inside capture silently no-ops; the input path always continues."
```

---

## Task 6: Implement session_shutdown and session_compact handlers

**Files:**
- Modify: `extensions/pi/snowball.ts` (add shutdown + compact handlers)

- [ ] **Step 1: Add the extraction-worker spawn helper**

Append to `extensions/pi/snowball.ts`:

```typescript
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";

const EXTRACT_WORKER_SH = path.join(REPO_ROOT, "skills/decision-logging/scripts/extract-worker.sh");

const transcriptPathFor = (sessionId: string): string => {
  const dir = path.join(os.homedir(), ".snowball/pi-transcripts");
  mkdirSync(dir, { recursive: true });
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(dir, `${safe}.jsonl`);
};

const serializeMessagesFromSessionFile = (sessionFile: string): string => {
  try {
    // Lazy import to avoid loading the reader until it's needed.
    const { serializePiSession } = requireCjs(
      path.join(REPO_ROOT, "skills/decision-logging/scripts/pi-session-reader.ts"),
    ) as { serializePiSession: (p: string) => string };
    return serializePiSession(sessionFile);
  } catch {
    return "";
  }
};

const forkExtractionWorker = (
  ctx: { cwd: string; sessionManager?: { getSessionFile?: () => string | null } },
  sessionId: string,
  gitRoot: string | null,
): void => {
  const sessionFile = ctx.sessionManager?.getSessionFile?.();
  if (!sessionFile) return;
  const transcript = serializeMessagesFromSessionFile(sessionFile);
  if (!transcript) return;
  const transcriptPath = transcriptPathFor(sessionId);
  writeFileSync(transcriptPath, transcript);
  try {
    const child = spawn("bash", [EXTRACT_WORKER_SH, sessionId, gitRoot ?? "", transcriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // best-effort
  }
};
```

Note: `requireCjs` cannot load a `.ts` file directly under Node's loader. For runtime pi loads this via jiti; under bun tests we'll adjust the import path. The reader is also imported via the lazy `requireCjs` call — but that path needs to resolve in production. Replace the lazy loader with a direct static import:

```typescript
import { serializePiSession } from "../../skills/decision-logging/scripts/pi-session-reader";
```

(pi-session-reader.ts lives in `skills/decision-logging/scripts/`; the extension imports it via a relative path resolved at jiti load time.) Update the helper:

```typescript
const serializeMessagesFromSessionFile = (sessionFile: string): string => {
  try {
    return serializePiSession(sessionFile);
  } catch {
    return "";
  }
};
```

Drop the `requireCjs` lazy-import attempt entirely.

- [ ] **Step 2: Add the `session_shutdown` and `session_compact` handlers**

Insert inside the factory, after the `input` handler:

```typescript
  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const cap = loadCapture();
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      if (cap) {
        cap.captureBlastRadiusAudit({ gitRoot, sessionId, trigger: "stop" });
      }
      forkExtractionWorker(ctx, sessionId, gitRoot);
    } catch {
      // best-effort
    }
  });

  pi.on("session_compact", async (_event, ctx) => {
    try {
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      forkExtractionWorker(ctx, sessionId, gitRoot);
    } catch {
      // best-effort
    }
  });
```

- [ ] **Step 3: Run the full extension test suite**

Run: `bun test tests/pi/extension.test.ts`
Expected: 11 passing, 0 failing.

- [ ] **Step 4: Run the session-reader tests too**

Run: `bun test tests/pi/`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add extensions/pi/snowball.ts
git commit -m "feat(pi): session_shutdown and session_compact handlers

session_shutdown fires the blast-radius stop audit and forks the extraction
worker detached. session_compact fires only the worker (idempotent on the
worker's per-session cursor). Reuses extract-worker.sh and
pi-session-reader.ts unchanged."
```

---

## Task 7: Write `pi-tools.md` reference

**Files:**
- Create: `skills/using-snowball/references/pi-tools.md`

- [ ] **Step 1: Write the reference file**

Create `skills/using-snowball/references/pi-tools.md` with the full content agreed in Section 3 of the brainstorming. The mapping table, skill loading, operator prompts, task tracking, subagents, plan mode, configuration locations, and canonical docs sections — verbatim from the spec.

```markdown
---
name: pi-tools
description: Maps Claude Code tool names to pi equivalents. Use when reading snowball skills authored for Claude Code and adapting them to pi.
---

# Pi Tool Mapping

Skills use Claude Code tool names. Pi's built-in tools are lowercase (`read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`). The table below maps Claude Code primitives to their pi equivalents.

## Mapping

| Skill references | Pi equivalent | Notes |
|------------------|---------------|-------|
| `Read` | `read` | Native. |
| `Write` | `write` | Native. |
| `Edit` | `edit` | Native. |
| `Bash` | `bash` | Native. |
| `Grep` | `grep` | Native. |
| `Glob` | `find` | Pi has no glob; `find` with `-name` is closest. |
| `LS` | `ls` | Native. |
| `WebSearch` | none — use `bash` + `curl` | Pi has no built-in web tool. |
| `WebFetch` | none — use `bash` + `curl` | Same. |
| `AskUserQuestion` | none — see [Operator prompts](#operator-prompts) | Pi exposes `ctx.ui.select/confirm/input` only inside extensions. Snowball skills that ask operator questions degrade to plain text. |
| `TodoWrite` | none — see [Task tracking](#task-tracking) | Pi has no built-in todo. Use a TODO.md file or write your own extension. |
| `Skill` | `/skill:name` slash command | Pi expands `/skill:foo` to the skill's content before agent processing. The agent never calls an explicit `Skill` tool. |
| `Task` (subagent) | none — see [Subagents](#subagents) | Pi has no built-in subagent. Spawn a child pi process via tmux, or install a third-party subagent package. |
| `EnterPlanMode` / `ExitPlanMode` | none | Pi has no plan mode. Write plans to files (e.g., `plans/<topic>.md`). |
| `apply_patch` | `edit` | Pi has no `apply_patch`; use `edit` with explicit old/new text. |

## Skill loading

Pi auto-discovers `SKILL.md` files from any path returned by a `resources_discover` extension handler. The snowball extension returns `<snowball>/skills`, so every snowball skill is available without symlinks. The agent invokes a skill by typing `/skill:<name>`; pi expands the command to the skill body before the LLM sees the prompt. Skills can also be auto-loaded when their frontmatter `description` matches the task.

Frontmatter `allowed-tools` is ignored by pi — it does not constrain tool calls. Skill content that says "use only X" still has access to every active tool.

## Operator prompts

Pi has no `AskUserQuestion` equivalent. When a snowball skill instructs the agent to ask the operator a question, the agent should:

1. Pose the question in plain text in its reply.
2. Wait for the operator's free-text answer in the next prompt.

This is the documented pi workflow for clarification questions. The snowball decision spine therefore **cannot** capture operator MADRs from structured questions in pi — only from free-text approval phrases detected by the extension's `input` event. See `docs/README.pi.md` for the partial decision-spine coverage.

## Task tracking

Pi has no built-in todo. For progress tracking, the agent writes a `TODO.md` file in the working directory and updates it as work progresses. Snowball skills that drive progress through `TodoWrite` should substitute `write`/`edit` on `TODO.md` and reference its path in the reply.

## Subagents

Pi has no built-in subagent. The supported patterns are:

1. Spawn a child `pi` process via tmux (the documented escape hatch).
2. Install a third-party subagent package via `pi install npm:...`.
3. Write a custom extension that registers a `delegate` tool.

Snowball skills that reference the `Task` tool for parallel or sequential subagent dispatch will not work in pi without one of the above. The `dispatching-parallel-agents` and `subagent-driven-development` skills are documented as partial in pi.

## Plan mode

Pi has no plan mode. Snowball skills that call `EnterPlanMode` / `ExitPlanMode` substitute the workflow used by `writing-plans` directly: write the plan to `docs/snowball/plans/<topic>-plan.md`, then begin execution.

## Configuration locations

| Claude Code | Pi |
|-------------|-----|
| `~/.claude/settings.json` | `~/.pi/agent/settings.json` |
| `<project>/.claude/settings.json` | `<project>/.pi/settings.json` |
| `~/.claude/skills/<name>/` | discovered from any `resources_discover` `skillPaths` |
| `<project>/.claude/skills/<name>/` | discovered from any `resources_discover` `skillPaths` |
| `~/.claude/agents/<name>.md` | none — subagent via extension or package |
| `.mcp.json` | none — pi has no MCP; use extensions |
| `CLAUDE.md` / `AGENTS.md` | `AGENTS.md` (loaded automatically from `~/.pi/agent/`, walking up from cwd, and project root) |

## Canonical docs

- [pi README](https://github.com/badlogic/pi-mono)
- [pi extensions](https://github.com/badlogic/pi-mono/blob/main/extensions.md)
- [pi packages](https://github.com/badlogic/pi-mono/blob/main/packages.md)
```

- [ ] **Step 2: Verify the file exists and is non-empty**

Run: `test -s skills/using-snowball/references/pi-tools.md && echo OK`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add skills/using-snowball/references/pi-tools.md
git commit -m "docs(skills): add pi-tools.md reference

Maps Claude Code tool names to pi equivalents, with notes for the gaps
(AskUserQuestion, TodoWrite, Task, plan mode, apply_patch). Same shape as
the existing vtcode-tools.md and junie-tools.md references."
```

---

## Task 8: Update `using-snowball/SKILL.md`

**Files:**
- Modify: `skills/using-snowball/SKILL.md`

- [ ] **Step 1: Add the pi paragraph to "How to Access Skills"**

Find the existing per-harness list in `skills/using-snowball/SKILL.md` (after the "**In VTCode:**" paragraph and before "**In other environments:**"). Insert:

```markdown
**In Pi:** Skills auto-discover from any path returned by a `resources_discover` extension handler. Snowball ships an extension that exposes `<snowball>/skills`. Invoke a skill by typing `/skill:<name>`; pi expands the command to the skill body before agent processing.
```

- [ ] **Step 2: Add `pi-tools.md` to the Platform Adaptation list**

Find the line that begins "Non-CC platforms: see" and references copilot-tools.md (with `...` continuation). Append `pi-tools.md` (Pi) to that list:

```markdown
Non-CC platforms: see `references/copilot-tools.md` (Copilot CLI), `references/codex-tools.md` (Codex), `references/junie-tools.md` (Junie), `references/vtcode-tools.md` (VTCode), `references/aider-tools.md` (Aider), `references/pi-tools.md` (Pi) for tool equivalents. Gemini CLI users get the tool mapping loaded automatically via GEMINI.md.
```

- [ ] **Step 3: Verify the file still parses as valid Markdown**

Run: `bun x markdownlint-cli2 skills/using-snowball/SKILL.md 2>&1 | tail -5`
Expected: no errors (or pre-existing warnings unrelated to the new paragraph).

- [ ] **Step 4: Commit**

```bash
git add skills/using-snowball/SKILL.md
git commit -m "docs(skills): add pi to using-snowball SKILL.md

Adds a per-harness paragraph to 'How to Access Skills' and a link to
pi-tools.md in 'Platform Adaptation'."
```

---

## Task 9: Update `README.md`

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the pi row to the per-harness adapters table**

Find the table in `README.md` (the "Per-harness adapters" section). Append a row at the bottom (the table has 10 rows; add an 11th):

```markdown
| Pi | root `package.json` (`pi` key) | `extensions/pi/snowball.ts` (`resources_discover`, `before_agent_start`, `input`, `session_shutdown`, `session_compact`) | `skills/using-snowball/references/pi-tools.md` | decision spine partial |
```

- [ ] **Step 2: Add the Setup bullet for pi**

Find the "Setup" section's Quick install / Manual install bullet list. Append a new bullet:

```markdown
- **Pi**: from inside any project, run `pi install git:github.com/kellenff/snowball`. Pi clones the repo into `~/.pi/agent/git/snowball/` and auto-discovers the extension + skills. Verify with `pi list`. Detailed instructions: [`docs/README.pi.md`](docs/README.pi.md).
```

- [ ] **Step 3: Soften the "Not on any plugin marketplace" line**

Find the bullet that currently reads:

> Not on any plugin marketplace. Install is clone-and-link only.

Replace with:

> Not on any plugin marketplace **for Claude Code, Cursor, OpenCode, Codex, Gemini CLI, GitLab Duo, Aider, and VTCode**. **Pi users install via [`pi install git:github.com/kellenff/snowball`](docs/README.pi.md)** — a pi package, not a Claude-Code-style marketplace.

- [ ] **Step 4: Verify the README renders cleanly**

Run: `bun x markdownlint-cli2 README.md 2>&1 | tail -5`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: add pi to per-harness adapters and Setup

Adds the pi row to the per-harness table, a Setup bullet for the install
command, and softens the 'Not on any plugin marketplace' line to carve
out pi. Links to docs/README.pi.md (added in Task 10)."
```

---

## Task 10: Add `docs/README.pi.md`

**Files:**
- Create: `docs/README.pi.md`

- [ ] **Step 1: Write the install + usage doc**

Create `docs/README.pi.md` with the content agreed in Section 5 of the brainstorming. Frontmatter + Install + Verify + What you get + Tool name mapping + Decision spine partial + Update + Uninstall + Local development + Known gaps sections — verbatim from the spec.

```markdown
---
name: pi-readme
description: Install and use snowball in pi.
---

# Snowball for Pi

Snowball ships as a pi package: one command, no shell installer.

## Install

\`\`\`bash
pi install git:github.com/kellenff/snowball
\`\`\`

Pi clones the repo into \`~/.pi/agent/git/snowball/\` and auto-discovers:

- The bootstrap extension at \`extensions/pi/snowball.ts\`.
- All snowball skills at \`skills/<name>/SKILL.md\`.

Verify the install:

\`\`\`bash
pi list               # snowball appears in the package list
pi -p "list skills"   # skills are visible to the agent
\`\`\`

## What you get

At session start, the bootstrap extension injects \`using-snowball/SKILL.md\` into the system prompt. The agent follows the skill-check discipline: it invokes any matching skill before responding, exactly as on Claude Code.

Skills are invoked with the \`/skill:\` slash command. For example, before non-trivial design work:

\`\`\`
/skill:brainstorming
\`\`\`

The agent sees the full skill content and follows its checklist.

## Tool name mapping

Snowball skills are written for Claude Code tool names (\`Read\`, \`Edit\`, \`Bash\`, etc.). Pi's built-in tools are lowercase (\`read\`, \`edit\`, \`bash\`). The mapping reference at [\`skills/using-snowball/references/pi-tools.md\`](../skills/using-snowball/references/pi-tools.md) covers every Claude Code primitive, including the tools pi does not provide (\`AskUserQuestion\`, \`TodoWrite\`, \`Task\`, \`WebFetch\`).

## Decision spine (partial)

Snowball's decision spine captures operator MADRs and emits observations at session end. In pi, coverage is:

- ✅ Approval-phrase MADRs (operator types "looks good", "ship it", etc. — captured automatically).
- ✅ Blast-radius audits at session shutdown and on operator approvals.
- ✅ Implicit observation extraction before compaction and at session shutdown.
- ❌ Structured-question MADRs. Pi has no \`AskUserQuestion\` equivalent, so the most common MADR source on Claude Code is unavailable here.

This matches the Junie posture: forward spine complete, decision spine partial.

## Update

\`\`\`bash
pi install git:github.com/kellenff/snowball   # re-run to refresh
\`\`\`

Or to refresh only snowball without touching other packages:

\`\`\`bash
pi update git:github.com/kellenff/snowball
\`\`\`

## Uninstall

\`\`\`bash
pi remove git:github.com/kellenff/snowball
\`\`\`

Pi deletes the package directory and unregisters the extension and skills. No project files were modified — snowball is project-agnostic in pi.

## Local development

Clone the repo and run the extension from the local checkout while iterating:

\`\`\`bash
git clone https://github.com/kellenff/snowball ~/Projects/snowball
pi -e ~/Projects/snowball/extensions/pi/snowball.ts
\`\`\`

Edits in the clone take effect on next \`/reload\`. Once stable, \`pi install git:github.com/kellenff/snowball\` from the same checkout publishes the version you tested.

## Known gaps

- \`AskUserQuestion\` → plain text (see [pi-tools.md](../skills/using-snowball/references/pi-tools.md#operator-prompts)).
- \`TodoWrite\` → write a \`TODO.md\` file (see [pi-tools.md](../skills/using-snowball/references/pi-tools.md#task-tracking)).
- \`Task\` (subagent) → install a subagent package or spawn \`pi\` via tmux.
- \`EnterPlanMode\` / \`ExitPlanMode\` → write the plan to a file under \`docs/snowball/plans/\`.
```

- [ ] **Step 2: Verify the file exists and renders**

Run: `test -s docs/README.pi.md && bun x markdownlint-cli2 docs/README.pi.md 2>&1 | tail -5`
Expected: `OK` (first command), no errors (second).

- [ ] **Step 3: Commit**

```bash
git add docs/README.pi.md
git commit -m "docs: add README.pi.md install + usage doc

Covers install, verification, tool mapping, decision-spine partial coverage,
update, uninstall, local development, and known gaps. Links to pi-tools.md."
```

---

## Task 11: Update `RELEASE-NOTES.md`

**Files:**
- Modify: `RELEASE-NOTES.md`

- [ ] **Step 1: Add the v6.x entry**

Append a new entry at the top of the release notes (above the existing v5.2.0 entry, since the README's "What is different from upstream" table shows entries through v6.6.0):

```markdown
## v6.x — Pi harness adapter

- Adds `pi` as a per-harness adapter. Snowball ships as a pi package; one-command install via `pi install git:github.com/kellenff/snowball`.
- New `extensions/pi/snowball.ts` (TypeScript) injects the using-snowball bootstrap via `before_agent_start`, registers skills via `resources_discover`, captures approval-phrase MADRs via the `input` event, and fires blast-radius audits + extraction-worker forks on `session_shutdown` and `session_compact`.
- New `skills/using-snowball/references/pi-tools.md` maps Claude Code tool names to pi's lowercase built-ins and documents the gaps (no `AskUserQuestion`, no `TodoWrite`, no `Task`, no plan mode).
- New `skills/decision-logging/scripts/pi-session-reader.ts` serializes pi's session JSONL tree to the flat `{role, content}` format `extract-worker.sh` already consumes.
- Decision spine partial in pi: approval-phrase MADRs and blast-radius audits work; structured-question MADRs do not (no `AskUserQuestion` analog). Same posture as Junie.
```

(The version number should match the bump applied in Task 12.)

- [ ] **Step 2: Commit**

```bash
git add RELEASE-NOTES.md
git commit -m "docs(release-notes): add v6.x entry for pi harness adapter"
```

---

## Task 12: Version bump and final verification

**Files:**
- Modify: all version-bearing manifests (per `.version-bump.json`)

- [ ] **Step 1: Run the version bump script**

Run: `bash scripts/bump-version.sh <next>` where `<next>` is the maintainer-determined next version (likely 6.7.0 if vtcode follow-on lands first, or 6.8.0 if pi ships alone).

Expected output: the script updates every file in `.version-bump.json`'s `files` array. Verify with:

```bash
grep -E '"version"' package.json .claude-plugin/plugin.json .cursor-plugin/plugin.json .codex-plugin/plugin.json gemini-extension.json extensions/snowball/extension.json .claude-plugin/marketplace.json
```

All listed files should show the same `<next>` value.

- [ ] **Step 2: Run the full test suite**

Run: `bun test tests/`
Expected: all green (existing tests + new `tests/pi/` tests).

- [ ] **Step 3: Run pre-commit on all files**

Run: `pre-commit run --all-files`
Expected: all hooks pass (or are skipped with "no files to check").

- [ ] **Step 4: Manual smoke test (if pi is installed)**

If `pi` is available locally:

```bash
pi install git:file:///Users/kellen/Projects/snowball  # local install
pi -p "use brainstorming to design a hello-world CLI"
```

Expected: the agent announces it's using the brainstorming skill and follows the checklist. If `pi` is not installed locally, skip this step — manual verification will happen at the user's environment after merge.

- [ ] **Step 5: Commit the version bump**

```bash
git add package.json .claude-plugin/plugin.json .cursor-plugin/plugin.json .codex-plugin/plugin.json .claude-plugin/marketplace.json gemini-extension.json extensions/snowball/extension.json RELEASE-NOTES.md
git commit -m "release: bump version to <next>

Pi harness adapter ships. Forward spine complete; decision spine partial
(no AskUserQuestion analog in pi)."
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|--------------|------|
| Architecture (file layout) | Task 1, Task 2, Task 4, Task 7, Task 9, Task 10 |
| Extension module (5 events, CJS reuse) | Tasks 4, 5, 6 |
| Tool-name mapping reference | Task 7 |
| pi-session-reader | Task 2 |
| Extension smoke tests | Task 3 |
| using-snowball SKILL.md update | Task 8 |
| README.md updates | Task 9 |
| docs/README.pi.md | Task 10 |
| RELEASE-NOTES.md | Task 11 |
| Version bump | Task 12 |

**2. Placeholder scan:** No `TBD`, `TODO`, `implement later`, `add appropriate`, or vague steps. Every code step shows actual code. Every test step shows actual test code.

**3. Type consistency:**

- `serializePiSession(sessionFilePath: string): string` defined in Task 2 step 6. Used in Task 6 step 1 (`serializeMessagesFromSessionFile`) and Task 6 step 1 (the static import). Signatures match.
- `loadCapture(): Capture | null` defined in Task 5 step 1. Used in Task 5 step 3 and Task 6 step 2. Signature consistent.
- `findGitRoot(cwd: string): string | null` defined in Task 5 step 2. Used in Task 5 step 3 and Task 6 step 2. Signature consistent.
- `forkExtractionWorker(ctx, sessionId, gitRoot): void` defined in Task 6 step 1. Used in Task 6 step 2 (twice). Signature consistent.
- `ExtensionAPI` import used throughout Tasks 4-6 — sourced from `@earendil-works/pi-coding-agent` (bundled by pi at runtime; not declared as a dependency).
- `captureBlastRadiusAudit` / `handleUserPromptApproval` signatures in Task 5 step 1 match the CJS bundle exports (verified from `hooks/blast-radius-audit.cjs` and `skills/decision-logging/scripts/user-prompt-bridge.cjs`).
- The extension's expected event payload shapes (`{ text, source }` for `input`, `{ systemPrompt }` for `before_agent_start`, `{ reason }` for `session_shutdown`/`session_compact`, `{ reason }` for `resources_discover`) match pi's documented `ExtensionAPI` per the pi docs read during brainstorming.

No type drift detected.

---

## Blast-radius

Per the writing-plans skill, before handoff we run `snowball:blast-radius` with preset `design` to right-size the change. For this plan, that means the following paths:

- Created: `extensions/pi/snowball.ts`, `skills/decision-logging/scripts/pi-session-reader.ts`, `skills/using-snowball/references/pi-tools.md`, `tests/pi/extension.test.ts`, `tests/pi/session-reader.test.ts`, `tests/pi/fixtures/*`, `tests/pi/README.md`, `docs/README.pi.md`.
- Modified: `package.json`, `.version-bump.json`, `skills/using-snowball/SKILL.md`, `README.md`, `RELEASE-NOTES.md`, all version-bearing manifests.

(Self-gate: the repo is not yet indexed in codebase-memory; the blast-radius backend will degrade to git-diff heuristics, which is honest — the operator should expect a heuristic report with `backend: heuristic` rather than `backend: graph`.)

---

## Execution Handoff

Plan complete and saved to `docs/snowball/plans/2026-06-25-pi-harness-adapter.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
