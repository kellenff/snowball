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

// skills/measuring-skill-performance/src/analyze.ts
var exports_analyze = {};
__export(exports_analyze, {
  analyze: () => analyze
});
module.exports = __toCommonJS(exports_analyze);
var fs3 = __toESM(require("node:fs"));

// skills/measuring-skill-performance/src/transcript-reader.ts
var fs = __toESM(require("node:fs"));
function normalizeUsage(usage) {
  if (!usage)
    return null;
  return {
    input_tokens: usage.input_tokens ?? 0,
    cache_creation_input_tokens: usage.cache_creation_input_tokens ?? 0,
    cache_read_input_tokens: usage.cache_read_input_tokens ?? 0,
    output_tokens: usage.output_tokens ?? 0
  };
}

class ClaudeCodeTranscriptReader {
  read(transcriptPath) {
    const raw = fs.readFileSync(transcriptPath, "utf8");
    const messages = [];
    let index = 0;
    for (const line of raw.split(`
`)) {
      const trimmed = line.trim();
      if (!trimmed)
        continue;
      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      if (parsed.type !== "assistant" && parsed.type !== "user" && parsed.type !== "system")
        continue;
      const content = parsed.message?.content;
      const blocks = Array.isArray(content) ? content : [];
      const toolUses = blocks.filter((b) => b.type === "tool_use").map((b) => ({ id: b.id ?? "", name: b.name ?? "", input: b.input ?? {} }));
      const toolResults = blocks.filter((b) => b.type === "tool_result").map((b) => ({ toolUseId: b.tool_use_id ?? "", isError: b.is_error === true }));
      const hasUserText = parsed.type === "user" && (typeof content === "string" ? content.trim().length > 0 : blocks.some((b) => b.type === "text"));
      messages.push({
        index: index++,
        sessionId: parsed.sessionId ?? "",
        role: parsed.type,
        timestamp: parsed.timestamp ?? null,
        usage: normalizeUsage(parsed.message?.usage),
        hasUserText,
        toolUses,
        toolResults
      });
    }
    return messages;
  }
}

// skills/measuring-skill-performance/src/segmenter.ts
function skillName(use) {
  if (use.name !== "Skill")
    return null;
  const input = use.input;
  return input && typeof input.skill === "string" ? input.skill : null;
}
function segmentSkillWindows(messages) {
  const windows = [];
  let current = null;
  const close = () => {
    if (current)
      windows.push(current);
    current = null;
  };
  for (const m of messages) {
    if (m.role === "user" && m.hasUserText) {
      close();
      continue;
    }
    if (current) {
      current.messages.push(m);
      current.endedAt = m.timestamp;
      current.messageSpan = [current.messageSpan[0], m.index];
    }
    for (const use of m.toolUses) {
      const name = skillName(use);
      if (name === null)
        continue;
      close();
      current = {
        skillName: name,
        sessionId: m.sessionId,
        startedAt: m.timestamp,
        endedAt: m.timestamp,
        messageSpan: [m.index, m.index],
        messages: []
      };
    }
  }
  close();
  return windows;
}

// skills/measuring-skill-performance/src/types.ts
var FLAT_SEGMENTATION_APPROX = "flat-segmentation-no-nesting";

// skills/measuring-skill-performance/src/window-metrics.ts
function computeWindowMetrics(window) {
  let marginalTokens = 0;
  let totalTokens = 0;
  let toolCalls = 0;
  let toolErrors = 0;
  let retries = 0;
  const seen = new Set;
  for (const m of window.messages) {
    if (m.usage) {
      const marginal = m.usage.output_tokens + m.usage.cache_creation_input_tokens;
      marginalTokens += marginal;
      totalTokens += marginal + m.usage.input_tokens + m.usage.cache_read_input_tokens;
    }
    for (const use of m.toolUses) {
      if (use.name === "Skill")
        continue;
      toolCalls += 1;
      const key = `${use.name}:${JSON.stringify(use.input)}`;
      if (seen.has(key))
        retries += 1;
      else
        seen.add(key);
    }
    for (const res of m.toolResults) {
      if (res.isError)
        toolErrors += 1;
    }
  }
  return { marginalTokens, totalTokens, toolCalls, toolErrors, retries };
}

// skills/measuring-skill-performance/src/stats.ts
function percentile(values, p) {
  if (values.length === 0)
    return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(p / 100 * sorted.length);
  const index = Math.min(Math.max(rank - 1, 0), sorted.length - 1);
  return sorted[index];
}

// skills/measuring-skill-performance/src/aggregator.ts
var MAX_SAMPLE_WINDOWS = 5;
function aggregateCandidates(windows) {
  const bySkill = new Map;
  for (const w of windows) {
    const list = bySkill.get(w.skillName) ?? [];
    list.push(w);
    bySkill.set(w.skillName, list);
  }
  const records = [];
  for (const [skill, group] of bySkill) {
    const metrics = group.map((w) => ({ window: w, m: computeWindowMetrics(w) }));
    const marginal = metrics.map((x) => x.m.marginalTokens);
    const billed = metrics.map((x) => x.m.totalTokens);
    const toolCalls = metrics.reduce((s, x) => s + x.m.toolCalls, 0);
    const toolErrors = metrics.reduce((s, x) => s + x.m.toolErrors, 0);
    const retries = metrics.reduce((s, x) => s + x.m.retries, 0);
    const sample_windows = metrics.slice().sort((a, b) => b.m.marginalTokens - a.m.marginalTokens).slice(0, MAX_SAMPLE_WINDOWS).map((x) => ({
      sessionId: x.window.sessionId,
      startedAt: x.window.startedAt,
      messageSpan: x.window.messageSpan,
      marginalTokens: x.m.marginalTokens
    }));
    records.push({
      skill_name: skill,
      invocation_count: group.length,
      tokens: {
        marginal: {
          total: marginal.reduce((s, v) => s + v, 0),
          p50: percentile(marginal, 50),
          p95: percentile(marginal, 95)
        },
        billed_total: { p50: percentile(billed, 50), p95: percentile(billed, 95) }
      },
      reliability: {
        tool_calls: toolCalls,
        tool_error_rate: toolCalls === 0 ? 0 : toolErrors / toolCalls,
        retry_rate: toolCalls === 0 ? 0 : retries / toolCalls
      },
      triage_score: 0,
      sample_windows,
      approximations: [FLAT_SEGMENTATION_APPROX]
    });
  }
  return records;
}

// skills/measuring-skill-performance/src/ranker.ts
var defaultTriageScore = (c) => c.invocation_count * c.tokens.marginal.p50 * (1 + c.reliability.tool_error_rate);
function rankCandidates(candidates, score) {
  return candidates.map((c) => ({ ...c, triage_score: score(c) })).sort((a, b) => b.triage_score - a.triage_score);
}

// skills/measuring-skill-performance/src/exporters/json-exporter.ts
var fs2 = __toESM(require("node:fs"));
var path = __toESM(require("node:path"));
function writeCanonical(gitRoot, envelope) {
  const dir = path.join(gitRoot, ".snowball", "metrics");
  fs2.mkdirSync(dir, { recursive: true });
  fs2.writeFileSync(path.join(dir, "candidates.json"), JSON.stringify(envelope, null, 2) + `
`);
  const lines = envelope.candidates.flatMap((c) => c.sample_windows.map((w) => JSON.stringify({
    skill_name: c.skill_name,
    sessionId: w.sessionId,
    startedAt: w.startedAt,
    messageSpan: w.messageSpan,
    marginalTokens: w.marginalTokens
  })));
  fs2.writeFileSync(path.join(dir, "windows.jsonl"), lines.join(`
`) + (lines.length ? `
` : ""));
  return dir;
}

// skills/measuring-skill-performance/src/analyze.ts
function analyze(opts) {
  const reader = opts.reader ?? new ClaudeCodeTranscriptReader;
  const score = opts.score ?? defaultTriageScore;
  const windows = [];
  let dropped = 0;
  for (const p of opts.transcriptPaths) {
    try {
      windows.push(...segmentSkillWindows(reader.read(p)));
    } catch {
      dropped += 1;
    }
  }
  if (windows.length === 0) {
    return {
      status: "degraded",
      source: "claude-code",
      windowCount: 0,
      droppedWindowCount: dropped,
      transport: "json-only",
      reason: "no-skill-invocations",
      candidates: []
    };
  }
  const candidates = rankCandidates(aggregateCandidates(windows), score);
  const envelope = {
    status: "success",
    source: "claude-code",
    windowCount: windows.length,
    droppedWindowCount: dropped,
    transport: "json-only",
    reason: null,
    candidates
  };
  if (opts.emit !== false)
    writeCanonical(opts.gitRoot ?? process.cwd(), envelope);
  return envelope;
}
if (require.main == module) {
  const cmd = process.argv[2];
  const raw = fs3.readFileSync(0, "utf8");
  if (cmd === "analyze") {
    const input = JSON.parse(raw || "{}");
    process.stdout.write(JSON.stringify(analyze({ ...input, emit: input.emit ?? true }), null, 2) + `
`);
  } else {
    process.stderr.write(`usage: node skill-metrics.cjs analyze
`);
    process.exit(1);
  }
}
