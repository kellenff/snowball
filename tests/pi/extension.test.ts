import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync, copyFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";
import * as cp from "node:child_process";

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
    invoke: (event: string, ev: any = {}, ctx: any = {}) => handlers.get(event)?.(ev, ctx),
  };
};

const buildFixtureRepo = (): string => {
  const repo = mkdtempSync(join(tmpdir(), "snowball-pi-test-"));
  execSync("git init -q", { cwd: repo });
  const skillDir = join(repo, "skills/using-snowball");
  execSync(`mkdir -p "${skillDir}"`);
  execSync(`cp -R tests/pi/fixtures/snowball-bootstrap/. "${skillDir}/"`);

  const hooksDir = join(repo, "hooks");
  const decisionDir = join(repo, "skills/decision-logging/scripts");
  execSync(`mkdir -p "${hooksDir}" "${decisionDir}"`);

  writeFileSync(
    join(hooksDir, "blast-radius-audit.cjs"),
    `module.exports = { captureBlastRadiusAudit: (i) => globalThis.__captured?.push({ kind: "blast", ...i }) };`,
  );
  writeFileSync(
    join(decisionDir, "user-prompt-bridge.cjs"),
    `const APPROVAL_PHRASES = ["lgtm","looks good","ship it","approved","approve","go ahead","let's do that","yes do that","merge it","do it"];` +
      `module.exports = {` +
      `  handleUserPromptApproval: (i) => globalThis.__captured?.push({ kind: "approval", ...i }),` +
      `  matchesApproval: (prompt) => { const t = String(prompt ?? "").trim().toLowerCase(); return APPROVAL_PHRASES.some(p => t === p || (t.startsWith(p) && /[\\s.,;:!?]/.test(t[p.length] ?? ""))); }` +
      `};`,
  );
  writeFileSync(
    join(decisionDir, "extract-worker.sh"),
    `#!/bin/bash\necho "$@" >> "$SNOWBALL_TRANSCRIPT_OUT"\nexit 0\n`,
  );
  execSync(`chmod +x ${join(decisionDir, "extract-worker.sh")}`);

  // Copy the real pi-session-reader.ts and a session fixture into the temp
  // repo so the extension's SESSION_READER_PATH resolution finds them. Without
  // this, forkExtractionWorker spawns unconditionally but writes an empty
  // transcript; shutdown/compact tests pass for the wrong reason.
  copyFileSync(
    "skills/decision-logging/scripts/pi-session-reader.ts",
    join(decisionDir, "pi-session-reader.ts"),
  );
  copyFileSync("tests/pi/fixtures/sample-session.jsonl", join(repo, "session.jsonl"));

  return repo;
};

const importExtensionForRepo = async (repo: string) => {
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
  let spawnArgs: any[][];
  let spawnSpy: ReturnType<typeof spyOn<typeof cp, "spawn">>;

  beforeEach(() => {
    repo = buildFixtureRepo();
    captured = [];
    spawnCalls = [];
    spawnArgs = [];
    (globalThis as any).__captured = captured;

    spawnSpy = spyOn(cp, "spawn").mockImplementation(((...args: any[]) => {
      spawnArgs.push(args);
      spawnCalls.push(args.map(String));
      return { unref: () => {} } as any;
    }) as any);

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

  test("bootstrap not re-injected when systemPrompt already contains marker (post-reload)", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    // First injection.
    const first = await pi.invoke("before_agent_start", { systemPrompt: "BASE" });
    expect(first.systemPrompt).toContain("EXTREMELY_IMPORTANT");
    // Simulate /reload: factory is re-invoked; module-level state is reset.
    factory(pi.api);
    // Pi sends back the augmented prompt; the second call should be a no-op
    // because the system prompt already contains the marker.
    const second = await pi.invoke("before_agent_start", {
      systemPrompt: first.systemPrompt,
    });
    expect(second).toBeUndefined();
  });

  test("bootstrap missing → no injection", async () => {
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

  test("matches 'let's do that' via shared approval matcher", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "let's do that", source: "interactive" }, ctx);
    expect(captured).toContainEqual(
      expect.objectContaining({ kind: "approval", prompt: "let's do that" }),
    );
  });

  test("matches 'merge it' via shared approval matcher", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "merge it", source: "interactive" }, ctx);
    expect(captured).toContainEqual(
      expect.objectContaining({ kind: "approval", prompt: "merge it" }),
    );
  });

  test("does NOT match 'that works' (pi-only drift removed)", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "that works", source: "interactive" }, ctx);
    expect(captured).toHaveLength(0);
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

  test("session_shutdown fires stop audit + writes transcript + spawns worker", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("session_shutdown", { reason: "quit" }, ctx);

    expect(captured).toContainEqual(expect.objectContaining({ kind: "blast", trigger: "stop" }));
    expect(spawnSpy).toHaveBeenCalled();
    expect(spawnCalls[0].join(" ")).toContain("extract-worker.sh");

    // Verify the transcript at the spawn arg path contains real content from
    // sample-session.jsonl (exercises pi-session-reader.ts through the extension).
    const args = spawnArgs[0] as [string, string[], Record<string, unknown>];
    const transcriptPath = args[1][3];
    const out = readFileSync(transcriptPath, "utf8");
    expect(out).toContain("What is 2+2?");
    expect(out).toContain('"role":"assistant"');
  });

  test("session_compact writes transcript + spawns worker (no stop audit)", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("session_compact", { reason: "manual" }, ctx);

    expect(captured).toHaveLength(0);
    expect(spawnSpy).toHaveBeenCalled();
    expect(spawnCalls[0].join(" ")).toContain("extract-worker.sh");

    const args = spawnArgs[0] as [string, string[], Record<string, unknown>];
    const transcriptPath = args[1][3];
    const out = readFileSync(transcriptPath, "utf8");
    expect(out).toContain("What is 2+2?");
    expect(out).toContain('"role":"assistant"');
  });

  test("resources_discover returns skill paths", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const result = await pi.invoke("resources_discover", { reason: "startup" });
    expect(result.skillPaths).toEqual([join(repo, "skills")]);
  });

  test("capture unavailable → no throw", async () => {
    rmSync(join(repo, "hooks/blast-radius-audit.cjs"));
    rmSync(join(repo, "skills/decision-logging/scripts/user-prompt-bridge.cjs"));
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await pi.invoke("input", { text: "looks good", source: "interactive" }, ctx);
    await pi.invoke("session_shutdown", { reason: "quit" }, ctx);
    expect(captured).toHaveLength(0);
  });

  test("shutdown extraction failure swallowed", async () => {
    spawnSpy.mockImplementation((() => {
      throw new Error("boom");
    }) as any);
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    const ctx = {
      cwd: repo,
      sessionManager: { getSessionFile: () => join(repo, "session.jsonl") },
    };
    await expect(pi.invoke("session_shutdown", { reason: "quit" }, ctx)).resolves.toBeUndefined();
  });

  afterEach(() => {
    spawnSpy.mockRestore();
    rmSync(repo, { recursive: true, force: true });
    delete process.env.SNOWBALL_TRANSCRIPT_OUT;
  });
});
