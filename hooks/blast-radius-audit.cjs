var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  for (let key of __getOwnPropNames(mod))
    if (!__hasOwnProp.call(to, key))
      __defProp(to, key, {
        get: __accessProp.bind(mod, key),
        enumerable: true
      });
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __toCommonJS = (from) => {
  var entry = (__moduleCache ??= new WeakMap).get(from), desc;
  if (entry)
    return entry;
  entry = __defProp({}, "__esModule", { value: true });
  if (from && typeof from === "object" || typeof from === "function") {
    for (var key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(entry, key))
        __defProp(entry, key, {
          get: __accessProp.bind(from, key),
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
        });
  }
  __moduleCache.set(from, entry);
  return entry;
};
var __moduleCache;
var __returnValue = (v) => v;
function __exportSetter(name, newValue) {
  this[name] = __returnValue.bind(null, newValue);
}
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, {
      get: all[name],
      enumerable: true,
      configurable: true,
      set: __exportSetter.bind(all, name)
    });
};

// skills/blast-radius/src/audit-hook.ts
var exports_audit_hook = {};
__export(exports_audit_hook, {
  captureBlastRadiusAudit: () => captureBlastRadiusAudit,
  buildAuditObservation: () => buildAuditObservation
});
module.exports = __toCommonJS(exports_audit_hook);
var fs3 = __toESM(require("node:fs"));
var os = __toESM(require("node:os"));
var path3 = __toESM(require("node:path"));

// skills/decision-logging/src/approval-phrases.ts
var APPROVAL_PHRASES = [
  "lgtm",
  "looks good",
  "ship it",
  "approved",
  "approve",
  "go ahead",
  "let's do that",
  "yes do that",
  "merge it",
  "do it"
];
function matchesApproval(prompt) {
  if (typeof prompt !== "string")
    return false;
  const trimmed = prompt.trim().toLowerCase();
  if (!trimmed)
    return false;
  for (const phrase of APPROVAL_PHRASES) {
    if (trimmed === phrase)
      return true;
    if (trimmed.startsWith(phrase)) {
      const next = trimmed[phrase.length];
      if (/[\s.,;:!?]/.test(next))
        return true;
    }
  }
  return false;
}

// skills/decision-logging/src/append-observation.ts
var fs = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));

// skills/decision-logging/src/git-root.ts
var import_node_child_process = require("node:child_process");
function detectGitRoot(startDir) {
  try {
    const out = import_node_child_process.execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: startDir || process.cwd(),
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out.toString().trim();
  } catch {
    return null;
  }
}

// skills/decision-logging/src/append-observation.ts
var TYPES = ["observation", "implementation-choice", "hypothesis", "constraint"];
var CONFIDENCES = ["high", "medium", "low"];
var SOURCES = ["agent", "subagent"];
var SOURCE_SKILLS = [
  "brainstorming",
  "writing-plans",
  "systematic-debugging",
  "code-review",
  "ambient"
];
var SCHEMA_VERSIONS = ["1.0", "1.1"];
function validate(obs) {
  const errors = [];
  const o = obs;
  const requireString = (field) => {
    if (typeof o[field] !== "string" || !o[field]) {
      errors.push(`${field} required (non-empty string)`);
    }
  };
  requireString("schema_version");
  requireString("timestamp");
  requireString("session_id");
  requireString("content");
  requireString("rationale");
  if (!SCHEMA_VERSIONS.includes(o.schema_version)) {
    errors.push(`schema_version must be one of ${SCHEMA_VERSIONS.join(", ")}`);
  }
  if (!TYPES.includes(o.type)) {
    errors.push(`type must be one of ${TYPES.join(", ")}`);
  }
  if (!CONFIDENCES.includes(o.confidence)) {
    errors.push(`confidence must be one of ${CONFIDENCES.join(", ")}`);
  }
  if (!SOURCES.includes(o.source)) {
    errors.push(`source must be one of ${SOURCES.join(", ")}`);
  }
  if (!Array.isArray(o.tags) || o.tags.length < 1) {
    errors.push("tags must be a non-empty array");
  } else if (!SOURCE_SKILLS.includes(o.tags[0])) {
    errors.push(`tags[0] must be one of ${SOURCE_SKILLS.join(", ")}`);
  }
  if (!Array.isArray(o.related_files)) {
    errors.push("related_files must be an array");
  }
  if (o.related_decision !== null && typeof o.related_decision !== "string") {
    errors.push("related_decision must be string or null");
  }
  if (o.argdown_ref !== undefined) {
    if (o.schema_version === "1.0") {
      errors.push("argdown_ref requires schema_version 1.1");
    }
    const ref = o.argdown_ref;
    if (!ref || typeof ref !== "object") {
      errors.push("argdown_ref must be an object");
    } else {
      if (typeof ref.path !== "string" || !ref.path) {
        errors.push("argdown_ref.path required (non-empty string)");
      }
      if (typeof ref.node_label !== "string" || !ref.node_label) {
        errors.push("argdown_ref.node_label required (non-empty string)");
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
function appendObservation(obs, opts = {}) {
  const result = validate(obs);
  if (!result.valid) {
    throw new Error(`validation failed: ${result.errors.join("; ")}`);
  }
  const gitRoot = opts.gitRoot ?? detectGitRoot();
  if (!gitRoot)
    throw new Error("not in a git repo");
  const dir = path.join(gitRoot, "docs", "snowball", "decisions");
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "observations.jsonl");
  fs.appendFileSync(file, `${JSON.stringify(obs)}
`);
  return file;
}
if (false) {}

// skills/decision-logging/src/hook-payload.ts
function resolveSessionId(payload) {
  return (payload.session_id ?? payload.conversation_id ?? "").toString();
}

// skills/blast-radius/src/read-envelope.ts
var fs2 = __toESM(require("node:fs"));

// skills/blast-radius/src/envelope.ts
var BACKEND_ATTEMPTS = ["yactt", "codebase-memory", "heuristic"];
var REASON_CODES = [
  "graph-unavailable",
  "repo-not-indexed",
  "change-untracked",
  "mcp-timeout",
  "compute-error",
  "explicit-skip"
];
function isReasonCode(value) {
  return REASON_CODES.includes(value);
}
function assertEnvelope(envelope) {
  if (!["success", "degraded", "error"].includes(envelope.status)) {
    throw new Error(`invalid status: ${envelope.status}`);
  }
  if (!["graph", "heuristic", "none"].includes(envelope.backend)) {
    throw new Error(`invalid backend: ${envelope.backend}`);
  }
  if (envelope.status === "error") {
    if (envelope.backend !== "none")
      throw new Error("error status requires backend none");
    if (!envelope.reason)
      throw new Error("error status requires reason");
    if (envelope.output !== null)
      throw new Error("error status requires null output");
    return;
  }
  if (envelope.status === "success") {
    if (!envelope.output)
      throw new Error("success status requires output");
  }
  if (envelope.status === "degraded" && envelope.reason !== "explicit-skip") {
    if (!envelope.output)
      throw new Error("degraded status requires output unless explicit-skip");
  }
  if (envelope.reason && !isReasonCode(envelope.reason)) {
    throw new Error(`invalid reason: ${envelope.reason}`);
  }
  if (envelope.backend_attempts) {
    if (!Array.isArray(envelope.backend_attempts)) {
      throw new Error("backend_attempts must be an array");
    }
    for (const entry of envelope.backend_attempts) {
      if (!BACKEND_ATTEMPTS.includes(entry)) {
        throw new Error(`backend_attempts contains unknown value: ${entry}`);
      }
    }
  }
}

// skills/blast-radius/src/write-envelope.ts
var path2 = __toESM(require("node:path"));
function envelopeScratchPath(gitRoot) {
  return path2.join(gitRoot, ".snowball", "blast-radius", "last.json");
}

// skills/blast-radius/src/read-envelope.ts
function readLastEnvelope(gitRoot) {
  const target = envelopeScratchPath(gitRoot);
  if (!fs2.existsSync(target))
    return null;
  try {
    const parsed = JSON.parse(fs2.readFileSync(target, "utf8"));
    assertEnvelope(parsed);
    return parsed;
  } catch {
    return null;
  }
}

// skills/blast-radius/src/audit-hook.ts
var ERROR_LOG = path3.join(os.homedir(), ".snowball", "blast-radius-audit-errors.log");
function logError(msg) {
  try {
    fs3.mkdirSync(path3.dirname(ERROR_LOG), { recursive: true });
    fs3.appendFileSync(ERROR_LOG, `[${new Date().toISOString()}] ${msg}
`);
  } catch {}
}
function envelopeSummary(envelope) {
  const parts = [`status=${envelope.status}`, `backend=${envelope.backend}`];
  if (envelope.reason)
    parts.push(`reason=${envelope.reason}`);
  if (envelope.output?.action_risk.level) {
    parts.push(`action_risk=${envelope.output.action_risk.level}`);
  }
  return parts.join(", ");
}
function buildAuditObservation(input) {
  const summary = envelopeSummary(input.envelope);
  const content = input.trigger === "stop" ? `Blast-radius envelope captured at session Stop (${summary}).` : `Blast-radius envelope captured at operator approval (${summary}).`;
  const rationale = input.trigger === "operator-approval" && input.prompt?.trim() ? `Operator submitted approval phrase: "${input.prompt.trim()}". Envelope: ${summary}.` : `Passive audit capture on ${input.trigger}. Envelope: ${summary}.`;
  return {
    schema_version: "1.0",
    timestamp: new Date().toISOString(),
    session_id: input.sessionId,
    type: "observation",
    confidence: "high",
    source: "agent",
    content,
    rationale,
    related_files: [".snowball/blast-radius/last.json"],
    related_decision: null,
    tags: ["ambient", "blast-radius", input.trigger],
    blast_radius_envelope: input.envelope,
    capture_trigger: input.trigger
  };
}
function captureBlastRadiusAudit(input) {
  if (input.trigger === "operator-approval" && !matchesApproval(input.prompt ?? "")) {
    return false;
  }
  const envelope = readLastEnvelope(input.gitRoot);
  if (!envelope)
    return false;
  const obs = buildAuditObservation({
    sessionId: input.sessionId,
    trigger: input.trigger,
    envelope,
    prompt: input.prompt
  });
  appendObservation(obs, { gitRoot: input.gitRoot });
  return true;
}
function runCli(trigger) {
  let raw = "";
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload = {};
    if (raw.trim()) {
      try {
        payload = JSON.parse(raw);
      } catch (err) {
        logError(`audit-hook: bad JSON: ${err.message}`);
        process.exit(0);
        return;
      }
    }
    const gitRoot = detectGitRoot();
    if (!gitRoot)
      process.exit(0);
    const sessionId = resolveSessionId(payload) || "unknown";
    const prompt = payload.prompt ?? "";
    try {
      captureBlastRadiusAudit({
        gitRoot,
        sessionId,
        trigger,
        prompt: trigger === "operator-approval" ? prompt : undefined
      });
    } catch (err) {
      logError(`audit-hook: capture failed: ${err.message}`);
    }
    process.exit(0);
  });
}
if (require.main == module) {
  const trigger = process.argv[2];
  if (trigger !== "stop" && trigger !== "operator-approval") {
    logError(`audit-hook: invalid trigger "${trigger ?? ""}"`);
    process.exit(0);
  }
  runCli(trigger);
}
