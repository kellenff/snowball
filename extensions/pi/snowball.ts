import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import { pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, "../..");
const SKILL_BOOTSTRAP_PATH = path.join(REPO_ROOT, "skills/using-snowball/SKILL.md");
const SKILL_PATHS = [path.join(REPO_ROOT, "skills")];
const SESSION_READER_PATH = path.join(
  REPO_ROOT,
  "skills/decision-logging/scripts/pi-session-reader.ts",
);

import { createRequire } from "node:module";
const requireCjs = createRequire(import.meta.url);

const BLAST_RADIUS_AUDIT_CJS = path.join(REPO_ROOT, "hooks/blast-radius-audit.cjs");
const USER_PROMPT_BRIDGE_CJS = path.join(
  REPO_ROOT,
  "skills/decision-logging/scripts/user-prompt-bridge.cjs",
);

type Capture = {
  handleUserPromptApproval: (input: {
    prompt: string;
    sessionId: string;
    gitRoot: string | null;
  }) => boolean;
  captureBlastRadiusAudit: (input: {
    gitRoot: string | null;
    sessionId: string;
    trigger: string;
    prompt?: string;
  }) => boolean;
  matchesApproval: (prompt: string) => boolean;
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
      matchesApproval: prompt.matchesApproval,
    };
  } catch (err) {
    console.warn(
      `[snowball-pi] capture-load-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    _capture = null;
  }
  return _capture;
};

import { execFileSync } from "node:child_process";

const findGitRoot = (cwd: string): string | null => {
  try {
    // execFile (not exec) so the cwd is passed as a process argument, not
    // interpolated into a shell string. The current command literal is safe,
    // but defense-in-depth matters when cwd may carry unusual characters.
    return (
      execFileSync("git", ["rev-parse", "--show-toplevel"], {
        cwd,
        stdio: ["ignore", "pipe", "ignore"],
      })
        .toString()
        .trim() || null
    );
  } catch (err) {
    console.warn(
      `[snowball-pi] git-root-lookup-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
};

const EXTRACT_WORKER_SH = path.join(REPO_ROOT, "skills/decision-logging/scripts/extract-worker.sh");

const transcriptPathFor = (sessionId: string): string => {
  const dir = path.join(os.homedir(), ".snowball/pi-transcripts");
  mkdirSync(dir, { recursive: true });
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(dir, `${safe}.jsonl`);
};

type SessionReaderModule = { serializePiSession: (file: string) => string };
let _sessionReader: SessionReaderModule | null | undefined;

const loadSessionReader = async (): Promise<SessionReaderModule | null> => {
  if (_sessionReader !== undefined) return _sessionReader;
  try {
    const mod = (await import(pathToFileURL(SESSION_READER_PATH).href)) as SessionReaderModule;
    _sessionReader = mod;
    return mod;
  } catch (err) {
    console.warn(
      `[snowball-pi] session-reader-load-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    _sessionReader = null;
    return null;
  }
};

const serializeMessagesFromSessionFile = async (sessionFile: string): Promise<string> => {
  const mod = await loadSessionReader();
  if (!mod) return "";
  try {
    return mod.serializePiSession(sessionFile);
  } catch (err) {
    console.warn(
      `[snowball-pi] session-serialize-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
    return "";
  }
};

const forkExtractionWorker = async (
  ctx: { cwd: string; sessionManager?: { getSessionFile?: () => string | null } },
  sessionId: string,
  gitRoot: string | null,
): Promise<void> => {
  const sessionFile = ctx.sessionManager?.getSessionFile?.();
  const transcript = sessionFile ? await serializeMessagesFromSessionFile(sessionFile) : "";
  const transcriptPath = transcriptPathFor(sessionId);
  try {
    writeFileSync(transcriptPath, transcript || "\n");
  } catch (err) {
    console.warn(
      `[snowball-pi] transcript-write-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  try {
    // ponytail: spawn unconditionally; worker is idempotent on its per-session cursor,
    // so a missing or empty transcript is a safe no-op rather than a reason to skip.
    const child = spawn("bash", [EXTRACT_WORKER_SH, sessionId, gitRoot ?? "", transcriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch (err) {
    console.warn(
      `[snowball-pi] extract-spawn-failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
};

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
  pi.on("resources_discover", () => ({ skillPaths: SKILL_PATHS }));

  pi.on("before_agent_start", (event) => {
    // Content-based guard mirrors the opencode plugin's
    // experimental.chat.messages.transform defense. Survives factory
    // re-invocation from `pi /reload` (which resets per-instance state)
    // because we check the inbound prompt itself rather than local flags.
    if (event.systemPrompt?.includes("EXTREMELY_IMPORTANT")) return;
    const bootstrap = getBootstrap();
    if (!bootstrap) return;
    return { systemPrompt: `${event.systemPrompt}\n\n${bootstrap}` };
  });

  pi.on("input", (event, ctx) => {
    if (event.source !== "interactive") return;
    const cap = loadCapture();
    if (!cap || !cap.matchesApproval(event.text)) return;
    try {
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      cap.handleUserPromptApproval({ prompt: event.text, sessionId, gitRoot });
      cap.captureBlastRadiusAudit({
        gitRoot,
        sessionId,
        trigger: "operator-approval",
        prompt: event.text,
      });
    } catch (err) {
      console.warn(
        `[snowball-pi] approval-handler-error: ${err instanceof Error ? err.message : String(err)}`,
      );
      // never block the input path
    }
    return { action: "continue" };
  });

  pi.on("session_shutdown", async (_event, ctx) => {
    try {
      const cap = loadCapture();
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      if (cap) {
        cap.captureBlastRadiusAudit({ gitRoot, sessionId, trigger: "stop" });
      }
      await forkExtractionWorker(ctx, sessionId, gitRoot);
    } catch (err) {
      console.warn(
        `[snowball-pi] shutdown-handler-error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  pi.on("session_compact", async (_event, ctx) => {
    try {
      const gitRoot = findGitRoot(ctx.cwd);
      const sessionId = ctx.sessionManager?.getSessionFile?.() ?? "unknown";
      await forkExtractionWorker(ctx, sessionId, gitRoot);
    } catch (err) {
      console.warn(
        `[snowball-pi] compact-handler-error: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });
}
