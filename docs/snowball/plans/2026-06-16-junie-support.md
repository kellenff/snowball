# Junie (JetBrains IDE) Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use snowball:subagent-driven-development (recommended) or snowball:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Junie (JetBrains IDE plugin) as a first-class per-harness adapter in snowball, with full forward spine (skills + AGENTS.md) and a partial decision spine via a new `snowball-capture` MCP server.

**Architecture:** Junie extensions live at `extensions/<name>/` with an `extension.json` manifest, `skills/`, `agents/`, `guidelines/`, and `mcp/.mcp.json`. Skills use the same YAML-frontmatter-Markdown format snowball already ships, so they need no transformation. The new `snowball-capture` MCP server (Bun/TS, bundled to a single CJS file) exposes three tools — `madr_capture`, `approval_phrase_record`, `observation_log` — that wrap the existing `writeMadr` / `appendObservation` / `matchesApproval` data layer. Output lands in the same `docs/snowball/decisions/` location and format every other harness uses.

**Tech Stack:** Bun + TypeScript + zod (for input validation), `@modelcontextprotocol/sdk` (for the MCP server), `bun:test` for tests, `bun build` to bundle to CJS.

**Spec:** [`docs/snowball/specs/2026-06-16-junie-support-design.md`](../specs/2026-06-16-junie-support-design.md)

---

## File Structure

**Created:**

```text
extensions/snowball/
├── extension.json                                # Junie extension manifest
├── .junie/AGENTS.md                              # bootstrap + capture rules
├── skills/                                       # symlink to ../../skills
└── mcp/.mcp.json                                 # MCP server wiring

extensions/snowball/snowball-capture/
├── package.json                                  # Bun/TS project
├── tsconfig.json
├── src/
│   ├── server.ts                                 # MCP server entry, registers tools
│   ├── session-id.ts                             # stable session_id helper
│   ├── errors.ts                                 # ErrorCode enum + ToolResult<T> type
│   ├── schemas.ts                                # zod schemas for all 3 tools
│   └── tools/
│       ├── madr-capture.ts
│       ├── approval-phrase-record.ts
│       └── observation-log.ts
└── dist/server.cjs                               # bundled output (committed)

tests/snowball-capture/
├── madr-capture.test.ts                          # Layer 1: pure unit
├── approval-phrase-record.test.ts
├── observation-log.test.ts
├── integration/
│   ├── capture-pipeline.test.ts                  # Layer 2: tmpdir round-trip
│   ├── contract.test.ts                          # Layer 3: shape parity w/ hook bridges
│   └── fixtures/
│       ├── canonical-madr.md
│       └── canonical-observation.jsonl
└── smoke.sh                                      # Layer 4: MCP server smoke test

scripts/build-snowball-capture.sh                 # bun build the MCP server
```

**Modified:**

- `scripts/build-decision-logging.sh` — adds `approval-phrases` to the build list (it was inlined into `user-prompt-bridge.cjs` previously; standalone bundle is needed for the MCP server to import it).
- `extensions/snowball/.junie/AGENTS.md` — written in two phases: Task 1 ships the bootstrap; Task 11 adds the capture rules.
- `README.md` — adds Junie row to the per-harness adapters table, a Junie install snippet in the Setup section, and a `v6.3.0` row in the changelog.
- `RELEASE-NOTES.md` — adds the `v6.3.0` section.
- `.pre-commit-config.yaml` — adds `build-snowball-capture` and `bun-test-snowball-capture` hooks.

**Not touched:**

- `skills/decision-logging/src/*` — the capture pipeline is reused as-is.
- `skills/decision-logging/scripts/*.cjs` (existing bundles) — re-built in Task 2, no source change.
- `extensions/snowball/.junie/AGENTS.md` capture-rule text — drafted in Task 11; bootstrap text is from `skills/using-snowball/SKILL.md`, kept in sync by convention.

---

## Task 1: Extension scaffold + manifest + skills symlink + AGENTS.md bootstrap

**Goal:** Create the `extensions/snowball/` directory tree that Junie will read. Ship the `extension.json` manifest, the skills symlink, and the AGENTS.md bootstrap (using-snowball text + skill index). Capture rules come in Task 11.

**Files:**

- Create: `extensions/snowball/extension.json`
- Create: `extensions/snowball/.junie/AGENTS.md`
- Create: `extensions/snowball/skills` (symlink)

- [ ] **Step 1: Create the directory and `extension.json`**

```bash
mkdir -p extensions/snowball/.junie
mkdir -p extensions/snowball/mcp
```

Write `extensions/snowball/extension.json`:

```json
{
  "name": "snowball",
  "version": "0.1.0",
  "description": "Snowball skills library: agentic skills that remember why. Loads as agent context in Junie; decision-spine capture via the bundled snowball-capture MCP server."
}
```

- [ ] **Step 2: Symlink the skills directory**

```bash
cd extensions/snowball && ln -s ../../skills skills
ls -la extensions/snowball/skills | head -5
```

Expected: the symlink resolves to the 18-skill `skills/` directory at the repo root.

- [ ] **Step 3: Copy the `using-snowball` text into `.junie/AGENTS.md`**

Read `skills/using-snowball/SKILL.md` (it is the canonical source of truth for the bootstrap). Create `extensions/snowball/.junie/AGENTS.md` with two sections:

```markdown
<!-- BEGIN SNOWBALL BOOTSTRAP (mirror of skills/using-snowball/SKILL.md) -->
<!-- If you change the source, change this and the test in tests/snowball-capture/ -->

# Using Snowball

<full text of skills/using-snowball/SKILL.md verbatim>

## Skill Index

The following skills are available in this Junie extension. Invoke by name when a task fits:

- `brainstorming` — gated design exploration. Use before any creative work.
- `writing-plans` — produces an implementation plan before code is written.
- `executing-plans` — runs an existing plan with review checkpoints.
- `test-driven-development` — red/green/refactor enforcement.
- `systematic-debugging` — root-cause-first debugging.
- `verification-before-completion` — show verification output before claiming success.
- `finishing-a-development-branch` — structured merge / PR / cleanup.
- `requesting-code-review` — produces review-ready output.
- `receiving-code-review` — responds to feedback with technical rigor.
- `subagent-driven-development` — orchestrates implementation across subagents.
- `dispatching-parallel-agents` — splits independent tasks across parallel agents.
- `decision-logging` — REFERENCE ONLY (no hooks fire in Junie; the MCP tools below do the work).
- `syncing-decisions-to-memory` — distills the decision logs into a project ADR.
- `recalling-project-context` — cycle-start recall of prior rationale.
- `structured-argumentation` — argdown as an intermediate representation.
- `using-git-worktrees` — isolated workspace for feature work.
- `writing-skills` — meta-skill for creating new skills.
- `using-snowball` — this skill.

<!-- END SNOWBALL BOOTSTRAP -->
```

The placeholder `<full text of skills/using-snowball/SKILL.md verbatim>` is replaced with the actual file content in this step (no `TBD`). The drift guard test lives in Task 11.

- [ ] **Step 4: Verify the layout**

```bash
ls -la extensions/snowball/
test -L extensions/snowball/skills && echo "skills is a symlink"
test -f extensions/snowball/.junie/AGENTS.md && echo "AGENTS.md exists"
test -f extensions/snowball/extension.json && echo "manifest exists"
```

Expected: three `ok`-style lines.

- [ ] **Step 5: Commit**

```bash
git add extensions/snowball/extension.json \
        extensions/snowball/.junie/AGENTS.md \
        extensions/snowball/skills
git commit -m "feat(extensions/junie): scaffold Junie extension with bootstrap AGENTS.md"
```

---

## Task 2: Standalone `approval-phrases.cjs` bundle

**Goal:** Make `approval-phrases.ts` available as a standalone CJS bundle that the MCP server can import. The current `build-decision-logging.sh` inlines it into `user-prompt-bridge.cjs`; that doesn't help a different consumer.

**Files:**

- Modify: `scripts/build-decision-logging.sh:11-16` (the `ENTRIES` array)
- Create: `skills/decision-logging/scripts/approval-phrases.cjs` (generated by build)

- [ ] **Step 1: Add `approval-phrases` to the build entries**

Edit `scripts/build-decision-logging.sh`. Change the `ENTRIES=( ... )` block from:

```bash
ENTRIES=(
  write-madr
  append-observation
  ask-user-question-bridge
  user-prompt-bridge
)
```

to:

```bash
ENTRIES=(
  write-madr
  append-observation
  ask-user-question-bridge
  user-prompt-bridge
  approval-phrases
)
```

- [ ] **Step 2: Run the build**

```bash
bash scripts/build-decision-logging.sh
```

Expected output: `built 5 bundles into .../skills/decision-logging/scripts/`.

- [ ] **Step 3: Verify the bundle exports `matchesApproval`**

```bash
node -e "const m = require('./skills/decision-logging/scripts/approval-phrases.cjs'); console.log(typeof m.matchesApproval, m.matchesApproval('lgtm'), m.matchesApproval('nope'));"
```

Expected: `function true false`.

- [ ] **Step 4: Commit**

```bash
git add scripts/build-decision-logging.sh \
        skills/decision-logging/scripts/approval-phrases.cjs
git commit -m "feat(decision-logging): bundle approval-phrases as standalone cjs"
```

---

## Task 3: MCP server project skeleton + shared types

**Goal:** Stand up the `snowball-capture` Bun/TS project: `package.json`, `tsconfig.json`, `src/server.ts` (minimal, registers zero tools), and the three shared modules (`errors.ts`, `schemas.ts`, `session-id.ts`).

**Files:**

- Create: `extensions/snowball/snowball-capture/package.json`
- Create: `extensions/snowball/snowball-capture/tsconfig.json`
- Create: `extensions/snowball/snowball-capture/src/server.ts`
- Create: `extensions/snowball/snowball-capture/src/errors.ts`
- Create: `extensions/snowball/snowball-capture/src/schemas.ts`
- Create: `extensions/snowball/snowball-capture/src/session-id.ts`
- Create: `tests/snowball-capture/smoke.test.ts`

- [ ] **Step 1: Create the project files**

Write `extensions/snowball/snowball-capture/package.json`:

```json
{
  "name": "snowball-capture",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "main": "dist/server.cjs",
  "scripts": {
    "build": "bun build src/server.ts --target=node --format=cjs --outfile=dist/server.cjs",
    "test": "bun test"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "bun-types": "latest",
    "typescript": "^5.4.0"
  }
}
```

Write `extensions/snowball/snowball-capture/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "lib": ["ES2022"],
    "types": ["bun-types"]
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Write `src/errors.ts`**

```ts
export const ErrorCode = [
  "INVALID_INPUT",
  "NOT_AN_APPROVAL",
  "NOT_IN_GIT_REPO",
  "WRITE_FAILED",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ErrorCode)[number];

export type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: ErrorCode };

export function err(code: ErrorCode, message: string): ToolResult<never> {
  return { ok: false, error: message, code };
}

export function ok<T>(data: T): ToolResult<T> {
  return { ok: true, data };
}
```

- [ ] **Step 3: Write `src/session-id.ts`**

```ts
import { randomUUID } from "node:crypto";

// One UUID per MCP-server process; held in module scope so all tool calls
// in the same Junie session share a single session_id, matching the
// per-session invariant of the existing capture pipeline.
export const SESSION_ID: string = randomUUID();
```

- [ ] **Step 4: Write `src/schemas.ts` (zod schemas for the three tools)**

```ts
import { z } from "zod";

export const MadrCaptureInput = z.object({
  question: z.string().min(1).max(2000),
  options: z
    .array(
      z.object({
        name: z.string().min(1).max(200),
        description: z.string().min(1).max(2000),
      }),
    )
    .min(2)
    .max(8),
  chosen: z.string().min(1).max(200),
  context: z.string().max(5000).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
});
export type MadrCaptureInput = z.infer<typeof MadrCaptureInput>;

export const ApprovalPhraseRecordInput = z.object({
  phrase: z.string().min(1).max(2000),
  action: z.string().min(1).max(5000),
  context: z.string().max(5000).optional(),
});
export type ApprovalPhraseRecordInput = z.infer<typeof ApprovalPhraseRecordInput>;

export const ObservationType = z.enum([
  "observation",
  "implementation-choice",
  "hypothesis",
  "constraint",
]);
export const ObservationConfidence = z.enum(["high", "medium", "low"]);

export const ObservationLogInput = z.object({
  content: z.string().min(1).max(5000),
  type: ObservationType,
  confidence: ObservationConfidence,
  rationale: z.string().min(1).max(5000),
  related_files: z.array(z.string().min(1).max(500)).max(50).optional(),
  tags: z.array(z.string().min(1).max(50)).max(10).optional(),
  // Optional overrides (rarely needed; defaults set by the tool)
  session_id: z.string().uuid().optional(),
  timestamp: z.string().datetime().optional(),
});
export type ObservationLogInput = z.infer<typeof ObservationLogInput>;
```

- [ ] **Step 5: Write `src/server.ts` (minimal — no tools yet)**

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "snowball-capture",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 6: Write a smoke test that the server starts (no tools registered)**

Create `tests/snowball-capture/smoke.test.ts`:

```ts
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BUNDLE = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/dist/server.cjs",
);

let bundleExists = false;

beforeAll(() => {
  bundleExists = fs.existsSync(BUNDLE);
  if (!bundleExists) {
    console.warn(`smoke test skipped: bundle not built at ${BUNDLE}`);
  }
});

describe("snowball-capture MCP server", () => {
  it("starts and responds to MCP initialize", async () => {
    if (!bundleExists) return;
    const proc = spawn("node", [BUNDLE], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (out += c.toString()));

    const init = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      },
    });
    proc.stdin.write(init + "\n");
    proc.stdin.end();

    const exitCode: number = await new Promise((resolve) =>
      proc.on("exit", (code) => resolve(code ?? -1)),
    );

    // Server should exit cleanly when stdin closes; output should mention the
    // server name we registered.
    expect(out).toContain("snowball-capture");
  }, 5000);
});
```

- [ ] **Step 7: Install deps, build, run the smoke test**

```bash
cd extensions/snowball/snowball-capture
bun install
bun run build
cd ../../..
bun test tests/snowball-capture/smoke.test.ts
```

Expected: smoke test passes. The bundle exists at `dist/server.cjs`.

- [ ] **Step 8: Commit**

```bash
git add extensions/snowball/snowball-capture/package.json \
        extensions/snowball/snowball-capture/tsconfig.json \
        extensions/snowball/snowball-capture/src/server.ts \
        extensions/snowball/snowball-capture/src/errors.ts \
        extensions/snowball/snowball-capture/src/schemas.ts \
        extensions/snowball/snowball-capture/src/session-id.ts \
        extensions/snowball/snowball-capture/dist/server.cjs \
        tests/snowball-capture/smoke.test.ts
git commit -m "feat(snowball-capture): scaffold MCP server project + shared types"
```

---

## Task 4: `madr_capture` tool (TDD)

**Goal:** Implement the first tool. The handler validates input, calls `writeMadr`, and returns the file path. Tests cover both the pure validation path and the integration path against a tmpdir.

**Files:**

- Create: `extensions/snowball/snowball-capture/src/tools/madr-capture.ts`
- Create: `tests/snowball-capture/madr-capture.test.ts`
- Create: `tests/snowball-capture/integration/capture-pipeline.test.ts` (used by all three tools; madr part is the first half)
- Modify: `extensions/snowball/snowball-capture/src/server.ts` (register the tool)

- [ ] **Step 1: Write the failing pure unit tests**

Create `tests/snowball-capture/madr-capture.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { MadrCaptureInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("madr_capture input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = MadrCaptureInput.safeParse({
      question: "Which approach?",
      options: [
        { name: "A", description: "first option" },
        { name: "B", description: "second option" },
      ],
      chosen: "A",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty question", () => {
    const r = MadrCaptureInput.safeParse({
      question: "",
      options: [
        { name: "A", description: "x" },
        { name: "B", description: "y" },
      ],
      chosen: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rejects fewer than two options", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [{ name: "A", description: "only" }],
      chosen: "A",
    });
    expect(r.success).toBe(false);
  });

  it("rejects more than eight options", () => {
    const opts = Array.from({ length: 9 }, (_, i) => ({
      name: `O${i}`,
      description: `desc ${i}`,
    }));
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: opts,
      chosen: "O0",
    });
    expect(r.success).toBe(false);
  });

  it("rejects chosen not present in options", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [
        { name: "A", description: "a" },
        { name: "B", description: "b" },
      ],
      chosen: "C",
    });
    expect(r.success).toBe(false);
  });

  it("accepts context and tags when provided", () => {
    const r = MadrCaptureInput.safeParse({
      question: "q",
      options: [
        { name: "A", description: "a" },
        { name: "B", description: "b" },
      ],
      chosen: "B",
      context: "we discussed this in the meeting",
      tags: ["brainstorming", "approach-selection"],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they pass (the schema is the only implementation so far)**

```bash
bun test tests/snowball-capture/madr-capture.test.ts
```

Expected: 6 tests pass. (No TDD red phase needed — the schema was implemented in Task 3 and these tests validate it.)

- [ ] **Step 3: Write the failing integration test**

Create `tests/snowball-capture/integration/capture-pipeline.test.ts` (we'll add the other two tools' tests in their tasks; this file starts with the madr half):

```ts
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/madr-capture.ts",
);

let tmpDir: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-junie-madr-"));
  fs.mkdirSync(path.join(tmpDir, ".git"), { recursive: true });
  fs.writeFileSync(path.join(tmpDir, ".git", "HEAD"), "ref: refs/heads/main");
  fs.mkdirSync(path.join(tmpDir, "docs/snowball/decisions"), { recursive: true });
  process.chdir(tmpDir);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function runTool(input: unknown): { stdout: string; stderr: string; status: number } {
  const r = spawnSync("bun", ["run", TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("madr_capture (integration)", () => {
  it("writes a MADR under docs/snowball/decisions/", () => {
    const result = runTool({
      question: "Which approach?",
      options: [
        { name: "A", description: "skills only" },
        { name: "B", description: "skills + MCP capture" },
      ],
      chosen: "B",
      context: "we explored this in the brainstorm",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    expect(fs.existsSync(out.data.path)).toBe(true);
    const content = fs.readFileSync(out.data.path, "utf8");
    expect(content).toContain("Which approach?");
    expect(content).toContain("skills + MCP capture");
    expect(content).toContain("ask-user-question"); // capture_mechanism
    expect(content).toContain("operator"); // source
  });

  it("returns NOT_IN_GIT_REPO when not in a git repo", () => {
    const other = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-junie-nogit-"));
    const prev = process.cwd();
    process.chdir(other);
    try {
      const result = runTool({
        question: "q",
        options: [
          { name: "A", description: "a" },
          { name: "B", description: "b" },
        ],
        chosen: "A",
      });
      const out = JSON.parse(result.stdout);
      expect(out.ok).toBe(false);
      expect(out.code).toBe("NOT_IN_GIT_REPO");
    } finally {
      process.chdir(prev);
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 4: Run the integration test — it fails (no implementation yet)**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: fail with "Could not find: .../tools/madr-capture.ts" or similar.

- [ ] **Step 5: Implement `src/tools/madr-capture.ts`**

```ts
import { writeMadr } from "../../../../skills/decision-logging/src/write-madr.js";
import { err, ok, type ToolResult } from "../errors.js";
import { MadrCaptureInput, type MadrCaptureInput as T } from "../schemas.js";
import { SESSION_ID } from "../session-id.js";
import { randomUUID } from "node:crypto";

export interface MadrCaptureOutput {
  path: string;
  id: string;
}

export function runMadrCapture(raw: unknown): ToolResult<MadrCaptureOutput> {
  const parsed = MadrCaptureInput.safeParse(raw);
  if (!parsed.success) {
    return err("INVALID_INPUT", parsed.error.message);
  }
  const input: T = parsed.data;

  // Validate chosen is in options (zod doesn't know the relationship).
  if (!input.options.some((o) => o.name === input.chosen)) {
    return err("INVALID_INPUT", `chosen "${input.chosen}" not in options`);
  }

  const chosenOpt = input.options.find((o) => o.name === input.chosen)!;
  const rejected = input.options.filter((o) => o.name !== input.chosen);

  const title = input.question.length > 80
    ? input.question.slice(0, 77) + "..."
    : input.question;

  const now = new Date().toISOString();

  try {
    const path = writeMadr({
      title,
      status: "accepted",
      date: now,
      deciders: ["kellen"],
      snowball: {
        schema_version: "1.1",
        source: "operator",
        confidence: "high",
        capture_mechanism: "ask-user-question",
        session_id: SESSION_ID,
        source_event_id: randomUUID(),
        supersedes: null,
        tags: ["ambient", ...(input.tags ?? [])],
      },
      body: {
        context: input.context ?? "Captured from a Junie session via the snowball-capture MCP server.",
        considered_options: [
          ...rejected.map((o) => ({ name: o.name, description: o.description })),
          { name: chosenOpt.name, description: chosenOpt.description },
        ],
        decision_outcome: `Chose **${chosenOpt.name}** — ${chosenOpt.description}.`,
        consequences: [],
        links: [],
      },
    });
    return ok({ path, id: SESSION_ID });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("not in a git repo")) return err("NOT_IN_GIT_REPO", msg);
    if (msg.includes("EACCES") || msg.includes("ENOSPC"))
      return err("WRITE_FAILED", msg);
    return err("INTERNAL", msg);
  }
}

// CLI entry: read JSON from stdin, write MADR, print result JSON on stdout
if (import.meta.main) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const out = runMadrCapture(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(
        JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n",
      );
      process.exit(1);
    }
  });
}
```

- [ ] **Step 6: Run the integration tests — they pass**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 7: Commit**

```bash
git add extensions/snowball/snowball-capture/src/tools/madr-capture.ts \
        tests/snowball-capture/madr-capture.test.ts \
        tests/snowball-capture/integration/capture-pipeline.test.ts
git commit -m "feat(snowball-capture): add madr_capture tool (TDD)"
```

---

## Task 5: `approval_phrase_record` tool (TDD)

**Goal:** Implement the second tool. Same pattern as Task 4, but the matcher is reused from `approval-phrases.ts` and a non-matching phrase returns `NOT_AN_APPROVAL`.

**Files:**

- Create: `extensions/snowball/snowball-capture/src/tools/approval-phrase-record.ts`
- Create: `tests/snowball-capture/approval-phrase-record.test.ts`
- Modify: `tests/snowball-capture/integration/capture-pipeline.test.ts` (add the approval half)

- [ ] **Step 1: Write the failing pure unit tests**

Create `tests/snowball-capture/approval-phrase-record.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { ApprovalPhraseRecordInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("approval_phrase_record input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "lgtm",
      action: "approving the design",
    });
    expect(r.success).toBe(true);
  });

  it("rejects empty phrase", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "",
      action: "x",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty action", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "lgtm",
      action: "",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional context", () => {
    const r = ApprovalPhraseRecordInput.safeParse({
      phrase: "ship it",
      action: "approving the spec",
      context: "after the user reviewed the design",
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run unit tests (the schema is in place from Task 3)**

```bash
bun test tests/snowball-capture/approval-phrase-record.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Append integration tests for `approval_phrase_record`**

Open `tests/snowball-capture/integration/capture-pipeline.test.ts` and **append** the following to the existing file (do not replace earlier content):

```ts
// ─── approval_phrase_record ─────────────────────────────────────────

const APPROVAL_TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/approval-phrase-record.ts",
);

function runApprovalTool(input: unknown): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const r = spawnSync("bun", ["run", APPROVAL_TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("approval_phrase_record (integration)", () => {
  it("writes a MADR with user-prompt-pattern mechanism on a matching phrase", () => {
    const result = runApprovalTool({
      phrase: "lgtm",
      action: "approving the design",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const content = fs.readFileSync(out.data.path, "utf8");
    expect(content).toContain("user-prompt-pattern");
    expect(content).toContain("approving the design");
  });

  it("returns NOT_AN_APPROVAL on a non-matching phrase", () => {
    const result = runApprovalTool({
      phrase: "do that thing you mentioned earlier",
      action: "trying to capture a non-approval",
    });
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(false);
    expect(out.code).toBe("NOT_AN_APPROVAL");
  });
});
```

- [ ] **Step 4: Run the new integration tests — they fail**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: the new approval tests fail; the madr tests still pass.

- [ ] **Step 5: Implement `src/tools/approval-phrase-record.ts`**

```ts
import { writeMadr } from "../../../../skills/decision-logging/src/write-madr.js";
import { matchesApproval } from "../../../../skills/decision-logging/src/approval-phrases.js";
import { err, ok, type ToolResult } from "../errors.js";
import {
  ApprovalPhraseRecordInput,
  type ApprovalPhraseRecordInput as T,
} from "../schemas.js";
import { SESSION_ID } from "../session-id.js";
import { randomUUID } from "node:crypto";

export interface ApprovalPhraseRecordOutput {
  path: string;
  id: string;
}

export function runApprovalPhraseRecord(
  raw: unknown,
): ToolResult<ApprovalPhraseRecordOutput> {
  const parsed = ApprovalPhraseRecordInput.safeParse(raw);
  if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
  const input: T = parsed.data;

  if (!matchesApproval(input.phrase)) {
    return err("NOT_AN_APPROVAL", `"${input.phrase}" is not a recognized approval phrase`);
  }

  const now = new Date().toISOString();
  const title = `Approval: ${input.action}`;

  try {
    const path = writeMadr({
      title,
      status: "accepted",
      date: now,
      deciders: ["kellen"],
      snowball: {
        schema_version: "1.1",
        source: "operator",
        confidence: "high",
        capture_mechanism: "user-prompt-pattern",
        session_id: SESSION_ID,
        source_event_id: randomUUID(),
        supersedes: null,
        tags: ["ambient"],
      },
      body: {
        context:
          input.context ??
          `Operator submitted an approval phrase in a Junie session: "${input.phrase}".`,
        considered_options: [],
        decision_outcome: `Action taken on approval: ${input.action}.`,
        consequences: [],
        links: [],
      },
    });
    return ok({ path, id: SESSION_ID });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("not in a git repo")) return err("NOT_IN_GIT_REPO", msg);
    if (msg.includes("EACCES") || msg.includes("ENOSPC"))
      return err("WRITE_FAILED", msg);
    return err("INTERNAL", msg);
  }
}

if (import.meta.main) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const out = runApprovalPhraseRecord(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(
        JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n",
      );
      process.exit(1);
    }
  });
}
```

- [ ] **Step 6: Run all integration tests**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: all tests pass (2 madr + 2 approval).

- [ ] **Step 7: Commit**

```bash
git add extensions/snowball/snowball-capture/src/tools/approval-phrase-record.ts \
        tests/snowball-capture/approval-phrase-record.test.ts \
        tests/snowball-capture/integration/capture-pipeline.test.ts
git commit -m "feat(snowball-capture): add approval_phrase_record tool (TDD)"
```

---

## Task 6: `observation_log` tool (TDD)

**Goal:** Implement the third tool. The handler validates input, calls `appendObservation`, and returns the line path. The session_id is the process-stable `SESSION_ID` constant (override allowed via input).

**Files:**

- Create: `extensions/snowball/snowball-capture/src/tools/observation-log.ts`
- Create: `tests/snowball-capture/observation-log.test.ts`
- Modify: `tests/snowball-capture/integration/capture-pipeline.test.ts` (add the observation half)

- [ ] **Step 1: Write the failing pure unit tests**

Create `tests/snowball-capture/observation-log.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { ObservationLogInput } from "../../extensions/snowball/snowball-capture/src/schemas.js";

describe("observation_log input validation", () => {
  it("accepts a minimum valid input", () => {
    const r = ObservationLogInput.safeParse({
      content: "we picked approach B because...",
      type: "implementation-choice",
      confidence: "high",
      rationale: "the alternative would have meant rewriting the schema",
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown type", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "nope",
      confidence: "high",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("rejects unknown confidence", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "observation",
      confidence: "maybe",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty content", () => {
    const r = ObservationLogInput.safeParse({
      content: "",
      type: "observation",
      confidence: "low",
      rationale: "y",
    });
    expect(r.success).toBe(false);
  });

  it("accepts optional related_files and tags", () => {
    const r = ObservationLogInput.safeParse({
      content: "x",
      type: "constraint",
      confidence: "medium",
      rationale: "y",
      related_files: ["src/foo.ts", "docs/spec.md"],
      tags: ["brainstorming", "scope"],
    });
    expect(r.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run unit tests**

```bash
bun test tests/snowball-capture/observation-log.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 3: Append integration tests for `observation_log`**

Open `tests/snowball-capture/integration/capture-pipeline.test.ts` and **append**:

```ts
// ─── observation_log ────────────────────────────────────────────────

const OBSERVATION_TOOL_SRC = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/observation-log.ts",
);

function runObservationTool(input: unknown): {
  stdout: string;
  stderr: string;
  status: number;
} {
  const r = spawnSync("bun", ["run", OBSERVATION_TOOL_SRC], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, stderr: r.stderr, status: r.status ?? -1 };
}

describe("observation_log (integration)", () => {
  it("appends a single line to observations.jsonl", () => {
    const result = runObservationTool({
      content: "we picked approach B because the hook rail doesn't exist on Junie",
      type: "implementation-choice",
      confidence: "high",
      rationale: "alternative was a wrapper script that would rot",
      tags: ["junie", "scope"],
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const obsPath = path.join(tmpDir, "docs/snowball/decisions/observations.jsonl");
    expect(fs.existsSync(obsPath)).toBe(true);
    const lines = fs.readFileSync(obsPath, "utf8").trim().split("\n");
    expect(lines.length).toBe(1);
    const row = JSON.parse(lines[0]);
    expect(row.content).toContain("approach B");
    expect(row.type).toBe("implementation-choice");
    expect(row.confidence).toBe("high");
    expect(row.source).toBe("agent");
    expect(row.tags).toContain("junie");
  });

  it("two sequential calls do not interleave (single-line JSONL)", () => {
    runObservationTool({
      content: "first",
      type: "observation",
      confidence: "low",
      rationale: "r1",
    });
    runObservationTool({
      content: "second",
      type: "observation",
      confidence: "low",
      rationale: "r2",
    });
    const obsPath = path.join(tmpDir, "docs/snowball/decisions/observations.jsonl");
    const lines = fs.readFileSync(obsPath, "utf8").trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).content).toBe("first");
    expect(JSON.parse(lines[1]).content).toBe("second");
  });
});
```

- [ ] **Step 4: Run — fails (no implementation)**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: the new observation tests fail; the existing ones pass.

- [ ] **Step 5: Implement `src/tools/observation-log.ts`**

```ts
import { appendObservation } from "../../../../skills/decision-logging/src/append-observation.js";
import { err, ok, type ToolResult } from "../errors.js";
import {
  ObservationLogInput,
  type ObservationLogInput as T,
} from "../schemas.js";
import { SESSION_ID } from "../session-id.js";

export interface ObservationLogOutput {
  path: string;
}

export function runObservationLog(raw: unknown): ToolResult<ObservationLogOutput> {
  const parsed = ObservationLogInput.safeParse(raw);
  if (!parsed.success) return err("INVALID_INPUT", parsed.error.message);
  const input: T = parsed.data;

  const now = new Date().toISOString();
  const sessionId = input.session_id ?? SESSION_ID;
  const timestamp = input.timestamp ?? now;

  try {
    const path = appendObservation({
      schema_version: "1.1",
      timestamp,
      session_id: sessionId,
      type: input.type,
      confidence: input.confidence,
      source: "agent",
      content: input.content,
      rationale: input.rationale,
      related_files: input.related_files ?? [],
      related_decision: null,
      tags: ["ambient", ...(input.tags ?? [])],
    });
    return ok({ path });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("not in a git repo")) return err("NOT_IN_GIT_REPO", msg);
    if (msg.includes("EACCES") || msg.includes("ENOSPC"))
      return err("WRITE_FAILED", msg);
    return err("INTERNAL", msg);
  }
}

if (import.meta.main) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const out = runObservationLog(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(
        JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n",
      );
      process.exit(1);
    }
  });
}
```

- [ ] **Step 6: Run all integration tests**

```bash
bun test tests/snowball-capture/integration/capture-pipeline.test.ts
```

Expected: all tests pass (2 madr + 2 approval + 2 observation).

- [ ] **Step 7: Commit**

```bash
git add extensions/snowball/snowball-capture/src/tools/observation-log.ts \
        tests/snowball-capture/observation-log.test.ts \
        tests/snowball-capture/integration/capture-pipeline.test.ts
git commit -m "feat(snowball-capture): add observation_log tool (TDD)"
```

---

## Task 7: Wire all three tools into the MCP server

**Goal:** Update `src/server.ts` to register the three tools, list them on `tools/list`, and dispatch `tools/call` to the right handler.

**Files:**

- Modify: `extensions/snowball/snowball-capture/src/server.ts`

- [ ] **Step 1: Update `server.ts`**

Replace the contents of `extensions/snowball/snowball-capture/src/server.ts` with:

```ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { runMadrCapture } from "./tools/madr-capture.js";
import { runApprovalPhraseRecord } from "./tools/approval-phrase-record.js";
import { runObservationLog } from "./tools/observation-log.js";

const server = new Server(
  { name: "snowball-capture", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "madr_capture",
      description:
        "Captures an AskUserQuestion-equivalent exchange as a MADR file under docs/snowball/decisions/.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
              required: ["name", "description"],
            },
          },
          chosen: { type: "string" },
          context: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["question", "options", "chosen"],
      },
    },
    {
      name: "approval_phrase_record",
      description:
        "Captures an approval phrase (lgtm, ship it, etc.) as a MADR with capture_mechanism=user-prompt-pattern. Refuses non-matching phrases with NOT_AN_APPROVAL.",
      inputSchema: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          action: { type: "string" },
          context: { type: "string" },
        },
        required: ["phrase", "action"],
      },
    },
    {
      name: "observation_log",
      description:
        "Appends a single observation line to docs/snowball/decisions/observations.jsonl.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          type: {
            type: "string",
            enum: ["observation", "implementation-choice", "hypothesis", "constraint"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
          related_files: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["content", "type", "confidence", "rationale"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;
  switch (name) {
    case "madr_capture":
      result = runMadrCapture(args);
      break;
    case "approval_phrase_record":
      result = runApprovalPhraseRecord(args);
      break;
    case "observation_log":
      result = runObservationLog(args);
      break;
    default:
      return {
        content: [
          { type: "text", text: JSON.stringify({ ok: false, code: "INTERNAL", error: `unknown tool: ${name}` }) },
        ],
        isError: true,
      };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 2: Rebuild and rerun the smoke test**

```bash
cd extensions/snowball/snowball-capture && bun run build && cd ../../..
bun test tests/snowball-capture/smoke.test.ts
```

Expected: smoke test passes (it only checks the server name appears in output, which it still does).

- [ ] **Step 3: Commit**

```bash
git add extensions/snowball/snowball-capture/src/server.ts \
        extensions/snowball/snowball-capture/dist/server.cjs
git commit -m "feat(snowball-capture): register all three tools in MCP server"
```

---

## Task 8: Contract test (Layer 3 — shape parity with hook-bridge output)

**Goal:** Generate canonical fixtures by calling `writeMadr` and `appendObservation` with a known input. Then assert that `madr_capture` and `observation_log` produce output that matches the fixtures modulo the timestamp / event_id / session_id fields. Drift fails the build.

**Files:**

- Create: `tests/snowball-capture/integration/contract.test.ts`
- Create: `tests/snowball-capture/integration/fixtures/canonical-madr.md`
- Create: `tests/snowball-capture/integration/fixtures/canonical-observation.jsonl`

- [ ] **Step 1: Write a one-shot script that generates the fixtures**

Create a temporary script `tests/snowball-capture/integration/_gen-fixtures.ts`:

```ts
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeMadr } from "../../../skills/decision-logging/src/write-madr.js";
import { appendObservation } from "../../../skills/decision-logging/src/append-observation.js";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-fixture-"));
fs.mkdirSync(path.join(tmp, ".git"), { recursive: true });
fs.writeFileSync(path.join(tmp, ".git", "HEAD"), "ref: refs/heads/main");
process.chdir(tmp);

const madrPath = writeMadr({
  title: "Which approach for the decision spine?",
  status: "accepted",
  date: "2026-06-16T12:00:00.000Z",
  deciders: ["kellen"],
  snowball: {
    schema_version: "1.1",
    source: "operator",
    confidence: "high",
    capture_mechanism: "ask-user-question",
    session_id: "00000000-0000-4000-8000-000000000000",
    source_event_id: "00000000-0000-4000-8000-000000000001",
    supersedes: null,
    tags: ["ambient", "contract-test"],
  },
  body: {
    context: "We explored three approaches.",
    considered_options: [
      { name: "A", description: "Skills only" },
      { name: "B", description: "Skills + MCP capture" },
    ],
    decision_outcome: "Chose **B** — Skills + MCP capture.",
    consequences: [],
    links: [],
  },
});

const obsPath = appendObservation({
  schema_version: "1.1",
  timestamp: "2026-06-16T12:00:01.000Z",
  session_id: "00000000-0000-4000-8000-000000000000",
  type: "implementation-choice",
  confidence: "high",
  source: "agent",
  content: "we picked approach B because the hook rail doesn't exist on Junie",
  rationale: "the alternative was a wrapper script that would rot",
  related_files: ["extensions/snowball/snowball-capture/src/tools/madr-capture.ts"],
  related_decision: null,
  tags: ["ambient", "junie", "contract-test"],
});

const madrText = fs.readFileSync(madrPath, "utf8");
const obsText = fs.readFileSync(obsPath, "utf8");

const outDir = path.resolve(__dirname, "fixtures");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "canonical-madr.md"), madrText);
fs.writeFileSync(path.join(outDir, "canonical-observation.jsonl"), obsText);

console.log("wrote fixtures to", outDir);
```

- [ ] **Step 2: Run the script once to generate the fixtures**

```bash
bun run tests/snowball-capture/integration/_gen-fixtures.ts
ls tests/snowball-capture/integration/fixtures/
```

Expected: two files exist.

- [ ] **Step 3: Delete the generator script**

```bash
rm tests/snowball-capture/integration/_gen-fixtures.ts
```

- [ ] **Step 4: Write the contract test**

Create `tests/snowball-capture/integration/contract.test.ts`:

```ts
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const MADR_TOOL = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/madr-capture.ts",
);
const OBS_TOOL = path.join(
  PROJECT_ROOT,
  "extensions/snowball/snowball-capture/src/tools/observation-log.ts",
);
const FIXTURES = path.join(__dirname, "fixtures");

let tmp: string;
let prevCwd: string;

beforeEach(() => {
  prevCwd = process.cwd();
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-contract-"));
  fs.mkdirSync(path.join(tmp, ".git"), { recursive: true });
  fs.writeFileSync(path.join(tmp, ".git", "HEAD"), "ref: refs/heads/main");
  fs.mkdirSync(path.join(tmp, "docs/snowball/decisions"), { recursive: true });
  process.chdir(tmp);
});

afterEach(() => {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
});

function runTool(bin: string, input: unknown): { stdout: string; status: number } {
  const r = spawnSync("bun", ["run", bin], {
    input: JSON.stringify(input),
    encoding: "utf8",
  });
  return { stdout: r.stdout, status: r.status ?? -1 };
}

// Normalize fields that legitimately differ between runs (timestamp, event_id,
// session_id). Anything else must match the canonical fixture.
function normalizeMadr(s: string): string {
  return s
    .replace(/date: '[^']*'/g, "date: '<NORMALIZED>'")
    .replace(/source_event_id: \S+/g, "source_event_id: <NORMALIZED>")
    .replace(/session_id: \S+/g, "session_id: <NORMALIZED>");
}

function normalizeObs(s: string): string {
  return s
    .replace(/"timestamp":"[^"]*"/g, '"timestamp":"<NORMALIZED>"')
    .replace(/"session_id":"[^"]*"/g, '"session_id":"<NORMALIZED>"');
}

describe("shape parity with hook-bridge output", () => {
  it("madr_capture produces output matching the canonical fixture (modulo normalized fields)", () => {
    const result = runTool(MADR_TOOL, {
      question: "Which approach for the decision spine?",
      options: [
        { name: "A", description: "Skills only" },
        { name: "B", description: "Skills + MCP capture" },
      ],
      chosen: "B",
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const got = normalizeMadr(fs.readFileSync(out.data.path, "utf8"));
    const want = normalizeMadr(
      fs.readFileSync(path.join(FIXTURES, "canonical-madr.md"), "utf8"),
    );
    expect(got).toBe(want);
  });

  it("observation_log produces output matching the canonical fixture (modulo normalized fields)", () => {
    const result = runTool(OBS_TOOL, {
      content: "we picked approach B because the hook rail doesn't exist on Junie",
      type: "implementation-choice",
      confidence: "high",
      rationale: "the alternative was a wrapper script that would rot",
      related_files: ["extensions/snowball/snowball-capture/src/tools/madr-capture.ts"],
      tags: ["junie", "contract-test"],
    });
    expect(result.status).toBe(0);
    const out = JSON.parse(result.stdout);
    expect(out.ok).toBe(true);
    const obsPath = path.join(tmp, "docs/snowball/decisions/observations.jsonl");
    const got = normalizeObs(fs.readFileSync(obsPath, "utf8").trim());
    const want = normalizeObs(
      fs.readFileSync(path.join(FIXTURES, "canonical-observation.jsonl"), "utf8").trim(),
    );
    expect(got).toBe(want);
  });
});
```

- [ ] **Step 5: Run the contract test**

```bash
bun test tests/snowball-capture/integration/contract.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 6: Commit**

```bash
git add tests/snowball-capture/integration/contract.test.ts \
        tests/snowball-capture/integration/fixtures/
git commit -m "test(snowball-capture): add shape-parity contract test"
```

---

## Task 9: AGENTS.md capture rules

**Goal:** Add the three capture-rule paragraphs to `extensions/snowball/.junie/AGENTS.md`, telling the agent when to call each MCP tool. Also add a drift-guard test that asserts the bootstrap section matches `skills/using-snowball/SKILL.md`.

**Files:**

- Modify: `extensions/snowball/.junie/AGENTS.md` (append the capture rules section)
- Create: `tests/snowball-capture/agents-md-drift.test.ts`

- [ ] **Step 1: Append the capture rules section to AGENTS.md**

Open `extensions/snowball/.junie/AGENTS.md` and **append** the following (do not modify the existing bootstrap block):

```markdown

---

## Capture rules (snowball-capture MCP server)

The `snowball-capture` MCP server is wired into this Junie extension. It exposes three tools that maintain the snowball decision spine (operator MADRs and agent observations). Call them at the right moments:

### `madr_capture` — after a multi-choice question

When you ask the user a multi-choice question and they answer, call `madr_capture` with:

```json
{
  "question": "<the question you asked>",
  "options": [{ "name": "...", "description": "..." }, ...],
  "chosen": "<the option the user picked>",
  "context": "<optional, why this matters>",
  "tags": ["<optional, e.g. brainstorming>"]
}
```

### `approval_phrase_record` — when the user sends an approval

When the user submits an approval phrase (`lgtm`, `looks good`, `ship it`, `approved`, `go ahead`, `merge it`, `do it`, etc.) and you act on it, call `approval_phrase_record` with:

```json
{
  "phrase": "<the exact phrase the user sent>",
  "action": "<what you did in response>",
  "context": "<optional, what was being approved>"
}
```

If the tool returns `NOT_AN_APPROVAL`, drop the call — the phrase didn't match. Do not retry with a different phrase.

### `observation_log` — for non-obvious choices

When you make a non-obvious implementation choice, surface a hypothesis, or notice a constraint, call `observation_log` before moving on. Pick the most accurate `type`:

- `implementation-choice` — for a decision that affects code shape
- `constraint` — for a hard limit (missing API, env, budget, etc.)
- `hypothesis` — for a guess you're acting on
- `observation` — for a general finding

```json
{
  "content": "<one or two sentences>",
  "type": "<one of the four>",
  "confidence": "high" | "medium" | "low",
  "rationale": "<why this matters or what it constrains>",
  "related_files": ["<optional paths>"],
  "tags": ["<optional, e.g. junie, brainstorm>"]
}
```

### What this does NOT cover

Junie has no public hook/lifecycle event API. These tools are active capture, not passive. The agent has to remember to call them. If you don't, the decision is unrecorded. That's accepted as the honest trade-off — passive capture is impossible on Junie today.

- [ ] **Step 2: Write the drift-guard test**

Create `tests/snowball-capture/agents-md-drift.test.ts`:

```ts
import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../../..");
const AGENTS_MD = path.join(
  PROJECT_ROOT,
  "extensions/snowball/.junie/AGENTS.md",
);
const USING_SNOWBALL = path.join(
  PROJECT_ROOT,
  "skills/using-snowball/SKILL.md",
);

describe("AGENTS.md bootstrap drift", () => {
  it("contains the using-snowball text verbatim", () => {
    const agents = fs.readFileSync(AGENTS_MD, "utf8");
    const source = fs.readFileSync(USING_SNOWBALL, "utf8");

    // We require that the full text appears somewhere in AGENTS.md, between
    // explicit BEGIN/END markers (added in Task 1). This is a containment
    // test, not a structural test — drift fails the build.
    const begin = "<!-- BEGIN SNOWBALL BOOTSTRAP";
    const end = "<!-- END SNOWBALL BOOTSTRAP";
    const beginIdx = agents.indexOf(begin);
    const endIdx = agents.indexOf(end);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);

    const between = agents.slice(beginIdx, endIdx);
    expect(between).toContain(source);
  });
});
```

- [ ] **Step 3: Run the drift test**

```bash
bun test tests/snowball-capture/agents-md-drift.test.ts
```

Expected: 1 test passes (the test confirms the using-snowball text is contained in AGENTS.md).

- [ ] **Step 4: Commit**

```bash
git add extensions/snowball/.junie/AGENTS.md \
        tests/snowball-capture/agents-md-drift.test.ts
git commit -m "feat(extensions/junie): add capture rules to AGENTS.md + drift test"
```

---

## Task 10: `mcp/.mcp.json` wiring with real paths

**Goal:** Replace the placeholder `.mcp.json` (created in Task 1) with a real wiring that points at the bundled `snowball-capture` server, the existing `argdown` MCP server, and the existing `codebase-memory` MCP server. Use absolute paths the user can adjust.

**Files:**

- Create: `extensions/snowball/mcp/.mcp.json`

- [ ] **Step 1: Write the wiring**

Write `extensions/snowball/mcp/.mcp.json`:

```json
{
  "mcpServers": {
    "snowball-capture": {
      "command": "node",
      "args": ["<absolute-path-to-snowball>/extensions/snowball/snowball-capture/dist/server.cjs"]
    },
    "argdown": {
      "command": "node",
      "args": ["<absolute-path-to-argdown-mcp>/dist/server.cjs"]
    },
    "codebase-memory": {
      "command": "node",
      "args": ["<absolute-path-to-codebase-memory-mcp>/dist/server.cjs"]
    }
  }
}
```

The user (or the install path) replaces `<absolute-path-to-*>` placeholders with the actual absolute paths on their machine. The same pattern is used by the other harnesses' MCP wiring in this repo.

- [ ] **Step 2: Validate JSON**

```bash
node -e "JSON.parse(require('fs').readFileSync('extensions/snowball/mcp/.mcp.json','utf8')); console.log('ok')"
```

Expected: `ok`.

- [ ] **Step 3: Commit**

```bash
git add extensions/snowball/mcp/.mcp.json
git commit -m "feat(extensions/junie): wire MCP servers in mcp/.mcp.json"
```

---

## Task 11: Pre-commit hooks for build + test

**Goal:** Add `build-snowball-capture` and `bun-test-snowball-capture` hooks to `.pre-commit-config.yaml`, mirroring the pattern for the other bundled skills.

**Files:**

- Modify: `.pre-commit-config.yaml` (append two local hooks)

- [ ] **Step 1: Read the existing tail of the config to anchor the insertion point**

```bash
tail -25 .pre-commit-config.yaml
```

- [ ] **Step 2: Append the two new hooks**

Append at the end of `.pre-commit-config.yaml`:

```yaml
      - id: build-snowball-capture
        name: build snowball-capture bundle
        entry: scripts/build-snowball-capture.sh
        language: system
        files: ^extensions/snowball/snowball-capture/src/.*\.ts$
        pass_filenames: false

      - id: bun-test-snowball-capture
        name: bun test snowball-capture
        entry: bash -c 'cd tests/snowball-capture && bun test'
        language: system
        files: ^extensions/snowball/snowball-capture/(src|dist)|^tests/snowball-capture/
        pass_filenames: false
```

- [ ] **Step 3: Write the build script**

Create `scripts/build-snowball-capture.sh`:

```bash
#!/usr/bin/env bash
# Build the snowball-capture MCP server from TypeScript into a single CJS bundle.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$SCRIPT_DIR/extensions/snowball/snowball-capture/src/server.ts"
OUT="$SCRIPT_DIR/extensions/snowball/snowball-capture/dist/server.cjs"

if ! command -v bun >/dev/null 2>&1; then
  echo "error: bun is required for building snowball-capture" >&2
  echo "install: https://bun.sh" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUT")"
tmp="$(mktemp)"
bun build "$SRC" \
  --target=node \
  --format=cjs \
  --outfile="$tmp"

if ! diff -q "$tmp" "$OUT" >/dev/null 2>&1; then
  mv "$tmp" "$OUT"
else
  rm "$tmp"
fi

echo "built snowball-capture bundle into $OUT"
```

Make it executable:

```bash
chmod +x scripts/build-snowball-capture.sh
```

- [ ] **Step 4: Run the new build script manually to verify**

```bash
bash scripts/build-snowball-capture.sh
```

Expected: `built snowball-capture bundle into .../dist/server.cjs`.

- [ ] **Step 5: Run the new test hook manually**

```bash
cd tests/snowball-capture && bun test
```

Expected: all tests pass.

- [ ] **Step 6: Verify pre-commit config is valid YAML**

```bash
python3 -c "import yaml,sys; yaml.safe_load(open('.pre-commit-config.yaml')); print('ok')"
```

Expected: `ok`.

- [ ] **Step 7: Commit**

```bash
git add .pre-commit-config.yaml scripts/build-snowball-capture.sh
git commit -m "ci: add build + test pre-commit hooks for snowball-capture"
```

---

## Task 12: README + RELEASE-NOTES updates

**Goal:** Add the Junie row to the per-harness adapters table, the Junie install snippet in the Setup section, a `v6.3.0` row in the changelog, and the `v6.3.0` section in RELEASE-NOTES.

**Files:**

- Modify: `README.md` (3 small additions)
- Modify: `RELEASE-NOTES.md` (1 new section at the top)

- [ ] **Step 1: Add the Junie row to the per-harness adapters table**

Open `README.md`, find the per-harness adapters table. After the GitLab Duo row, add:

```markdown
| Junie (JetBrains IDE plugin) | `extensions/snowball/extension.json` | bundled `snowball-capture` MCP server + `.junie/AGENTS.md` for context | `AGENTS.md` |
```

- [ ] **Step 2: Add a Junie install snippet in the Setup section**

In the Setup section, after the GitLab Duo bullet, add:

```markdown
- **Junie (JetBrains IDE plugin)**: in the IDE, install the local extension pointing at `extensions/snowball/` in this clone. Restart the IDE so Junie picks up the `mcp/.mcp.json` server definitions (replace the `<absolute-path-to-*>` placeholders with the real paths on your machine first). The `.junie/AGENTS.md` is read automatically as project guidelines.
```

- [ ] **Step 3: Add a `v6.3.0` row to the changelog**

In the "What is different from upstream" table, after the `v6.2.0` row, add:

```markdown
| v6.3.0 | Junie (JetBrains IDE plugin) support: forward spine via skills + AGENTS.md; decision spine via `snowball-capture` MCP server (partial — Junie has no hook rail) |
```

- [ ] **Step 4: Add the `v6.3.0` section to RELEASE-NOTES**

At the top of `RELEASE-NOTES.md`, prepend:

```markdown
## v6.3.0 (2026-06-16)

First-class support for Junie (JetBrains IDE plugin).

- **Forward spine** — all 18 skills load as Junie skills; the `using-snowball` bootstrap is injected via `.junie/AGENTS.md`.
- **Decision spine (partial)** — `snowball-capture` MCP server exposes `madr_capture`, `approval_phrase_record`, and `observation_log`. The Junie agent calls them at decision points; output lands in `docs/snowball/decisions/` in the same format every other harness uses.
- **Honest constraint** — Junie has no public hook/lifecycle event API. The decision spine is best-effort (the agent has to remember to call the tools); the forward spine is fully covered.

```

- [ ] **Step 5: Verify both files parse cleanly**

```bash
# markdownlint runs in pre-commit; let it flag anything
rg -n "Junie" README.md | head -5
rg -n "v6.3.0" README.md RELEASE-NOTES.md
```

Expected: at least one match in each file for the new content.

- [ ] **Step 6: Commit**

```bash
git add README.md RELEASE-NOTES.md
git commit -m "docs: add Junie support to README adapters table, Setup, and v6.3.0 changelog"
```

---

## Task 13: End-to-end manual verification (operator checklist)

**Goal:** Run the spec's "Manual verification" section on a developer machine with a JetBrains IDE + Junie installed. Capture the result in this commit (a short report under `docs/snowball/specs/2026-06-16-junie-support-verification.md`).

**Files:**

- Create: `docs/snowball/specs/2026-06-16-junie-support-verification.md`

- [ ] **Step 1: Walk through the spec's manual verification section**

Open `docs/snowball/specs/2026-06-16-junie-support-design.md` and re-read the "Manual verification" section. Run each step on a real Junie session:

1. Install the extension pointing at `extensions/snowball/`. Restart the IDE.
2. Verify AGENTS.md injection — confirm the bootstrap and capture rules appear in the project guidelines UI.
3. Exercise `madr_capture` — ask Junie a multi-choice question, answer it, check `docs/snowball/decisions/` for a new MADR.
4. Exercise `approval_phrase_record` — send "lgtm" after a substantive answer, check for a MADR with `capture_mechanism: user-prompt-pattern`.
5. Exercise `observation_log` — give Junie a task requiring a non-obvious choice; check `observations.jsonl`.
6. Run `syncing-decisions-to-memory`; verify the new MADRs are picked up.
7. Negative test — send a non-approval phrase; verify the agent's `approval_phrase_record` call returned `NOT_AN_APPROVAL`.

- [ ] **Step 2: Write the verification report**

Create `docs/snowball/specs/2026-06-16-junie-support-verification.md` with the outcome of each step, including any anomalies and workarounds discovered. If a step fails, open a follow-up issue and link it.

- [ ] **Step 3: Commit (only if the report has findings worth recording)**

```bash
git add docs/snowball/specs/2026-06-16-junie-support-verification.md
git commit -m "docs: record Junie manual verification results"
```

If the report is empty or the operator skips the manual run, do not commit. The task is complete when the spec's manual verification has been executed (or deliberately deferred to a dogfood session).
