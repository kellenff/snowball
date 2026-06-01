/**
 * Snowball plugin for OpenCode.ai
 *
 * Brings OpenCode to parity with the Claude Code / Cursor harnesses:
 *   - Injects snowball bootstrap context via the chat messages transform.
 *   - Auto-registers the skills directory via the config hook (no symlinks).
 *   - Decision-logging + blast-radius capture on OpenCode lifecycle events:
 *       chat.message                  → approval-phrase MADR + operator-approval audit
 *       event: session.idle           → stop blast-radius audit + implicit extraction
 *       experimental.session.compacting → implicit extraction before compaction
 *
 * The capture logic is reused in-process from the same bundles the shell hooks
 * run (hooks/blast-radius-audit.cjs, skills/decision-logging/scripts/*.cjs), so
 * there is a single source of truth across all harnesses.
 */

import path from "path";
import fs from "fs";
import os from "os";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawn } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requireCjs = createRequire(import.meta.url);

// Repo root is two levels up from .opencode/plugins/.
const REPO_ROOT = path.resolve(__dirname, "../..");
const BLAST_RADIUS_AUDIT_CJS = path.join(REPO_ROOT, "hooks", "blast-radius-audit.cjs");
const USER_PROMPT_BRIDGE_CJS = path.join(
  REPO_ROOT,
  "skills/decision-logging/scripts/user-prompt-bridge.cjs",
);
const EXTRACT_WORKER_SH = path.join(
  REPO_ROOT,
  "skills/decision-logging/scripts/extract-worker.sh",
);

// Lazily require the CJS capture bundles once. Returns null if a bundle is
// missing (e.g. a partial install) so the plugin degrades to bootstrap-only
// rather than throwing into OpenCode.
let _capture; // undefined = not loaded, null = unavailable
const getCapture = () => {
  if (_capture !== undefined) return _capture;
  try {
    const { captureBlastRadiusAudit } = requireCjs(BLAST_RADIUS_AUDIT_CJS);
    const { handleUserPromptApproval } = requireCjs(USER_PROMPT_BRIDGE_CJS);
    _capture = { captureBlastRadiusAudit, handleUserPromptApproval };
  } catch {
    _capture = null;
  }
  return _capture;
};

// Resolve the project's git root for THIS call. The plugin is a single
// long-lived process, so process.cwd() is the launch dir, not the project —
// always prefer the worktree/project root from the plugin context.
const resolveGitRoot = (ctx) => {
  const candidate = ctx?.worktree || ctx?.project?.worktree || ctx?.directory;
  return typeof candidate === "string" && candidate ? candidate : null;
};

// Pull the session id out of a hook/event payload, tolerating the field-name
// variations across OpenCode versions (sessionID / sessionId / id, possibly
// nested under .info or .properties).
const resolveSessionId = (...sources) => {
  for (const s of sources) {
    if (!s || typeof s !== "object") continue;
    const id = s.sessionID || s.sessionId || s.session_id || s.id || s.info?.id;
    if (typeof id === "string" && id) return id;
  }
  return null;
};

// Concatenate the text of a message's parts into a single prompt string.
const partsToText = (parts) => {
  if (!Array.isArray(parts)) return "";
  return parts
    .filter((p) => p && p.type === "text" && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
};

// Serialize a session's messages to a stable per-session JSONL transcript that
// the extraction worker tails. A stable (append-only superset) path keeps the
// worker's line-count cursor valid and avoids leaking mktemp files.
const transcriptPathFor = (sessionId) => {
  const dir = path.join(os.homedir(), ".snowball", "opencode-transcripts");
  fs.mkdirSync(dir, { recursive: true });
  // Sanitize the id for use as a filename.
  const safe = String(sessionId).replace(/[^A-Za-z0-9._-]/g, "_");
  return path.join(dir, `${safe}.jsonl`);
};

const serializeMessages = (messages) => {
  const arr = Array.isArray(messages) ? messages : Array.isArray(messages?.data) ? messages.data : [];
  const lines = [];
  for (const m of arr) {
    const info = m?.info ?? m;
    const role = info?.role ?? m?.role ?? "unknown";
    const text = partsToText(m?.parts ?? info?.parts) || (typeof info?.content === "string" ? info.content : "");
    if (!text) continue;
    lines.push(JSON.stringify({ role, content: text }));
  }
  return lines.join("\n") + (lines.length ? "\n" : "");
};

// Fetch the session transcript via the SDK client, write it to the stable path,
// and fork the extraction worker detached so it never blocks or ties up the
// long-lived plugin process. No-ops quietly on any failure (incl. missing
// `claude` CLI — the worker itself handles that).
const runExtraction = async (client, sessionId, gitRoot) => {
  if (!sessionId || !gitRoot) return;
  try {
    const messages = await client?.session?.messages?.({ path: { id: sessionId } });
    const serialized = serializeMessages(messages);
    if (!serialized) return;
    const transcriptPath = transcriptPathFor(sessionId);
    fs.writeFileSync(transcriptPath, serialized);
    const child = spawn("bash", [EXTRACT_WORKER_SH, sessionId, gitRoot, transcriptPath], {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
  } catch {
    // best-effort; extraction is non-critical
  }
};

// Simple frontmatter extraction (avoid dependency on skills-core for bootstrap)
const extractAndStripFrontmatter = (content) => {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, content };

  const frontmatterStr = match[1];
  const body = match[2];
  const frontmatter = {};

  for (const line of frontmatterStr.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line
        .slice(colonIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      frontmatter[key] = value;
    }
  }

  return { frontmatter, content: body };
};

// Normalize a path: trim whitespace, expand ~, resolve to absolute
const normalizePath = (p, homeDir) => {
  if (!p || typeof p !== "string") return null;
  let normalized = p.trim();
  if (!normalized) return null;
  if (normalized.startsWith("~/")) {
    normalized = path.join(homeDir, normalized.slice(2));
  } else if (normalized === "~") {
    normalized = homeDir;
  }
  return path.resolve(normalized);
};

// Module-level cache for bootstrap content.
// The SKILL.md file does not change during a session, so reading + parsing it
// once eliminates redundant fs.existsSync + fs.readFileSync + regex work on
// every agent step.  See #1202 for the full analysis.
let _bootstrapCache = undefined; // undefined = not yet loaded, null = file missing

// Per-session dedup so repeatedly-firing OpenCode hooks capture at most once per
// turn. chat.message and event:session.idle can both fire multiple times for a
// single operator turn, and captureBlastRadiusAudit has no internal dedup.
const _processedUserMessages = new Map(); // sessionId -> Set<messageId>
const _pendingStopCapture = new Set(); // sessionIds with an unconsumed user turn

const markUserMessageSeen = (sessionId, messageId) => {
  if (!sessionId || !messageId) return false; // can't dedup → treat as new
  let seen = _processedUserMessages.get(sessionId);
  if (!seen) {
    seen = new Set();
    _processedUserMessages.set(sessionId, seen);
  }
  if (seen.has(messageId)) return true; // already processed this turn
  seen.add(messageId);
  return false;
};

export const SnowballPlugin = async (ctx) => {
  const { client } = ctx;
  const homeDir = os.homedir();
  const snowballSkillsDir = path.resolve(__dirname, "../../skills");
  const envConfigDir = normalizePath(process.env.OPENCODE_CONFIG_DIR, homeDir);
  const _configDir = envConfigDir || path.join(homeDir, ".config/opencode");

  // Helper to generate bootstrap content (cached after first call)
  const getBootstrapContent = () => {
    // Return cached result on subsequent calls
    if (_bootstrapCache !== undefined) return _bootstrapCache;

    // Try to load using-snowball skill
    const skillPath = path.join(snowballSkillsDir, "using-snowball", "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      _bootstrapCache = null;
      return null;
    }

    const fullContent = fs.readFileSync(skillPath, "utf8");
    const { content } = extractAndStripFrontmatter(fullContent);

    const toolMapping = `**Tool Mapping for OpenCode:**
When skills reference tools you don't have, substitute OpenCode equivalents:
- \`TodoWrite\` → \`todowrite\`
- \`Task\` tool with subagents → Use OpenCode's subagent system (@mention)
- \`Skill\` tool → OpenCode's native \`skill\` tool
- \`Read\`, \`Write\`, \`Edit\`, \`Bash\` → Your native tools

Use OpenCode's native \`skill\` tool to list and load skills.`;

    _bootstrapCache = `<EXTREMELY_IMPORTANT>
You have snowball.

**IMPORTANT: The using-snowball skill content is included below. It is ALREADY LOADED - you are currently following it. Do NOT use the skill tool to load "using-snowball" again - that would be redundant.**

${content}

${toolMapping}
</EXTREMELY_IMPORTANT>`;

    return _bootstrapCache;
  };

  return {
    // Inject skills path into live config so OpenCode discovers snowball skills
    // without requiring manual symlinks or config file edits.
    // This works because Config.get() returns a cached singleton — modifications
    // here are visible when skills are lazily discovered later.
    config: async (config) => {
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];
      if (!config.skills.paths.includes(snowballSkillsDir)) {
        config.skills.paths.push(snowballSkillsDir);
      }
    },

    // Inject bootstrap into the first user message of each session.
    // Using a user message instead of a system message avoids:
    //   1. Token bloat from system messages repeated every turn (#750)
    //   2. Multiple system messages breaking Qwen and other models (#894)
    //
    // The hook fires on every agent step (not just every turn) because
    // opencode's prompt.ts reloads messages from DB each step.  Fresh message
    // arrays may need injection again, so getBootstrapContent() must not do
    // repeated disk work.
    "experimental.chat.messages.transform": async (_input, output) => {
      const bootstrap = getBootstrapContent();
      if (!bootstrap || !output.messages.length) return;
      const firstUser = output.messages.find((m) => m.info.role === "user");
      if (!firstUser || !firstUser.parts.length) return;

      // Guard: skip if first user message already contains bootstrap.
      // This prevents double injection when OpenCode passes an already
      // transformed in-memory message array through the hook again.
      if (firstUser.parts.some((p) => p.type === "text" && p.text.includes("EXTREMELY_IMPORTANT")))
        return;

      const ref = firstUser.parts[0];
      firstUser.parts.unshift({ ...ref, type: "text", text: bootstrap });
    },

    // UserPromptSubmit analog: capture operator approval phrases + blast-radius
    // operator-approval audit. Fires per received chat message; we dedup on the
    // message id and only act on user-role messages.
    "chat.message": async (_input, output) => {
      try {
        const capture = getCapture();
        if (!capture) return;
        const message = output?.message;
        const role = message?.role ?? message?.info?.role;
        if (role !== "user") return;

        const sessionId = resolveSessionId(message, message?.info, output);
        const messageId = message?.id ?? message?.info?.id;
        if (markUserMessageSeen(sessionId, messageId)) return; // already handled

        // A new operator turn is starting: arm the stop/extraction capture.
        if (sessionId) _pendingStopCapture.add(sessionId);

        const prompt = partsToText(output?.parts);
        if (!prompt) return;

        const gitRoot = resolveGitRoot(ctx);
        if (!gitRoot) return;

        capture.handleUserPromptApproval({ prompt, sessionId: sessionId ?? "unknown", gitRoot });
        capture.captureBlastRadiusAudit({
          gitRoot,
          sessionId: sessionId ?? "unknown",
          trigger: "operator-approval",
          prompt,
        });
      } catch {
        // capture is non-critical; never break the chat path
      }
    },

    // Stop analog: when the agent goes idle, run the blast-radius stop audit and
    // kick off implicit decision extraction — once per operator turn (the
    // _pendingStopCapture flag, set in chat.message, guards repeated idles).
    event: async ({ event }) => {
      try {
        if (event?.type !== "session.idle") return;
        const sessionId = resolveSessionId(event?.properties, event?.properties?.info, event);
        if (sessionId && !_pendingStopCapture.has(sessionId)) return;
        if (sessionId) _pendingStopCapture.delete(sessionId);

        const gitRoot = resolveGitRoot(ctx);
        if (!gitRoot) return;

        const capture = getCapture();
        if (capture) {
          capture.captureBlastRadiusAudit({
            gitRoot,
            sessionId: sessionId ?? "unknown",
            trigger: "stop",
          });
        }
        await runExtraction(client, sessionId, gitRoot);
      } catch {
        // best-effort
      }
    },

    // PreCompact analog: extract decisions before the continuation summary
    // replaces the transcript. Read-only — do not mutate the compaction output.
    "experimental.session.compacting": async (input) => {
      try {
        const sessionId = resolveSessionId(input, input?.session, input?.info);
        const gitRoot = resolveGitRoot(ctx);
        await runExtraction(client, sessionId, gitRoot);
      } catch {
        // best-effort
      }
    },
  };
};
