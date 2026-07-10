import { describe, test, expect, beforeEach, afterEach, spyOn } from "bun:test";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync, spawn as realSpawn } from "node:child_process";
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
    `module.exports = { handleUserPromptApproval: (i) => globalThis.__captured?.push({ kind: "approval", ...i }) };`,
  );
  writeFileSync(
    join(decisionDir, "extract-worker.sh"),
    `#!/bin/bash\necho "$@" >> "$SNOWBALL_TRANSCRIPT_OUT"\nexit 0\n`,
  );
  execSync(`chmod +x ${join(decisionDir, "extract-worker.sh")}`);

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
  let spawnSpy: ReturnType<typeof spyOn<typeof cp, "spawn">>;

  beforeEach(() => {
    repo = buildFixtureRepo();
    captured = [];
    spawnCalls = [];
    (globalThis as any).__captured = captured;

    spawnSpy = spyOn(cp, "spawn").mockImplementation(((...args: any[]) => {
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

  test("bootstrap not re-injected on second call", async () => {
    const { default: factory } = await importExtensionForRepo(repo);
    const pi = makePi();
    factory(pi.api);
    await pi.invoke("before_agent_start", { systemPrompt: "BASE" });
    const second = await pi.invoke("before_agent_start", { systemPrompt: "BASE2" });
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
