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

// skills/blast-radius/src/compute.ts
var exports_compute = {};
__export(exports_compute, {
  computeBlastRadius: () => computeBlastRadius,
  computeAndPersist: () => computeAndPersist
});
module.exports = __toCommonJS(exports_compute);

// skills/blast-radius/src/envelope.ts
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
}

// skills/blast-radius/src/schema.ts
var THRESHOLDS = {
  changeScope: {
    mediumFiles: 5,
    highFiles: 12,
    decompositionFiles: 8,
    decompositionSharedInfra: 3,
    decompositionCrossModule: 5
  },
  failureImpact: {
    mediumFanOut: 3,
    highFanOut: 8
  },
  actionRisk: {
    surfaceAt: "medium"
  }
};
var SHARED_INFRA_PATTERNS = [
  ".pre-commit-config.yaml",
  "package.json",
  "tsconfig.json",
  "scripts/",
  "hooks/"
];
var SENSITIVE_PATH_PATTERNS = [
  "hooks/",
  "skills/decision-logging/",
  ".pre-commit-config.yaml"
];
var MODULE_BUCKETS = ["skills/", "tests/", "hooks/", "scripts/", "docs/"];
var ACTION_RISK_RULES = [
  { tag: "destructive-shell", pattern: /\brm\s+-rf\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+push\s+--force\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bgit\s+reset\s+--hard\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\bdrop\s+table\b/i, level: "high" },
  { tag: "destructive-shell", pattern: /\btruncate\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bmigrate\b.*\bdown\b/i, level: "high" },
  { tag: "hard-to-reverse", pattern: /\bchmod\s+000\b/i, level: "high" },
  { tag: "shared-visible", pattern: /\bgit\s+push\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bgh\s+pr\s+create\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\bdeploy\b/i, level: "medium" },
  { tag: "shared-visible", pattern: /\brelease\b/i, level: "medium" },
  { tag: "third-party-upload", pattern: /\bcurl\b.*\b(-d|--data)\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bdbmate\b/i, level: "medium" },
  { tag: "schema-change", pattern: /\bALTER\s+TABLE\b/i, level: "medium" }
];
var LEVEL_RANK = { low: 0, medium: 1, high: 2 };
function maxRiskLevel(a, b) {
  return LEVEL_RANK[a] >= LEVEL_RANK[b] ? a : b;
}
function riskLevelFromFileCount(count) {
  if (count >= THRESHOLDS.changeScope.highFiles)
    return "high";
  if (count >= THRESHOLDS.changeScope.mediumFiles)
    return "medium";
  return "low";
}
function shouldFlagDecomposition(scope) {
  return scope.fileCount > THRESHOLDS.changeScope.decompositionFiles || scope.sharedInfraFileCount > THRESHOLDS.changeScope.decompositionSharedInfra || scope.crossModuleEditCount > THRESHOLDS.changeScope.decompositionCrossModule;
}
function matchesAnyPattern(path, patterns) {
  return patterns.some((p) => p.endsWith("/") ? path.startsWith(p) : path === p);
}
function countModuleBuckets(paths) {
  const hit = new Set;
  for (const file of paths) {
    for (const bucket of MODULE_BUCKETS) {
      if (file.startsWith(bucket))
        hit.add(bucket);
    }
  }
  return hit.size;
}

// skills/blast-radius/src/heuristic-backend.ts
function scoreActionRisk(text) {
  if (!text?.trim()) {
    return { level: "low", tags: [], rationale: [] };
  }
  let level = "low";
  const tags = [];
  const rationale = [];
  for (const rule of ACTION_RISK_RULES) {
    if (rule.pattern.test(text)) {
      if (!tags.includes(rule.tag))
        tags.push(rule.tag);
      level = maxRiskLevel(level, rule.level);
      rationale.push(`Matched ${rule.tag}`);
    }
  }
  return { level, tags, rationale };
}
function scoreChangeScope(paths) {
  const sharedInfraFileCount = paths.filter((p) => matchesAnyPattern(p, SHARED_INFRA_PATTERNS)).length;
  const buckets = countModuleBuckets(paths);
  const crossModuleEditCount = Math.max(0, buckets - 1);
  const fileCount = paths.length;
  return {
    fileCount,
    files: paths,
    sharedInfraFileCount,
    crossModuleEditCount,
    level: riskLevelFromFileCount(fileCount)
  };
}
function scoreFailureImpact(paths) {
  const sensitivePaths = paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  const buckets = countModuleBuckets(paths);
  const estimatedFanOut = sensitivePaths.length * 2 + Math.max(0, buckets - 1);
  let level = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut)
    level = "high";
  else if (estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut || sensitivePaths.length > 0) {
    level = "medium";
  }
  return { estimatedFanOut, sensitivePaths, level };
}
function computeHeuristic(input) {
  const paths = input.paths;
  return {
    change_scope: scoreChangeScope(paths),
    failure_impact: scoreFailureImpact(paths),
    action_risk: scoreActionRisk(input.proposedAction)
  };
}

// skills/blast-radius/src/mcp-cli.ts
var import_node_child_process = require("node:child_process");
var path = __toESM(require("node:path"));
var DEFAULT_TIMEOUT_MS = 15000;
function resolveCliBinary() {
  if (process.env.BLAST_RADIUS_DISABLE_GRAPH === "1")
    return null;
  const configured = process.env.CBM_CLI_PATH?.trim();
  if (configured)
    return configured;
  return "codebase-memory-mcp";
}
function runCliTool(binary, tool, args) {
  try {
    const out = import_node_child_process.execFileSync(binary, ["cli", tool, JSON.stringify(args)], {
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const trimmed = out.trim();
    if (!trimmed)
      return null;
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
}
function createDefaultCodebaseMemoryClient() {
  const binary = resolveCliBinary();
  if (!binary) {
    return {
      isAvailable: () => false,
      listProjects: () => [],
      detectChanges: () => null,
      searchGraph: () => null
    };
  }
  return {
    isAvailable: () => {
      try {
        import_node_child_process.execFileSync(binary, ["--version"], {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "ignore"]
        });
        return true;
      } catch {
        return false;
      }
    },
    listProjects: () => {
      const parsed = runCliTool(binary, "list_projects", {});
      return parsed?.projects ?? [];
    },
    detectChanges: (project, opts) => runCliTool(binary, "detect_changes", {
      project,
      scope: opts?.scope ?? "impact",
      ...opts?.base_branch ? { base_branch: opts.base_branch } : {}
    }),
    searchGraph: (project, opts) => runCliTool(binary, "search_graph", {
      project,
      ...opts
    })
  };
}
function resolveProjectName(projects, gitRoot) {
  const normalizedRoot = path.resolve(gitRoot);
  for (const p of projects) {
    if (path.resolve(p.root_path) === normalizedRoot)
      return p.name;
  }
  return null;
}

// skills/blast-radius/src/graph-backend.ts
function failureImpactFromFanOut(estimatedFanOut, sensitivePaths) {
  let level = "low";
  if (estimatedFanOut >= THRESHOLDS.failureImpact.highFanOut)
    level = "high";
  else if (estimatedFanOut >= THRESHOLDS.failureImpact.mediumFanOut || sensitivePaths.length > 0) {
    level = "medium";
  }
  return { estimatedFanOut, sensitivePaths, level };
}
function estimateGraphFanOut(client, project, paths, detect) {
  const seen = new Set;
  let fanOut = 0;
  for (const sym of detect?.impacted_symbols ?? []) {
    const key = sym.name ?? sym.file ?? "";
    if (key && !seen.has(key)) {
      seen.add(key);
      fanOut += 1;
    }
  }
  for (const filePath of paths) {
    const graph = client.searchGraph(project, {
      file_pattern: filePath,
      label: "Function",
      limit: 50
    });
    if (graph === null)
      continue;
    for (const node of graph.results ?? []) {
      const qn = node.qualified_name ?? node.name;
      if (!qn || seen.has(qn))
        continue;
      seen.add(qn);
      fanOut += Math.max(1, node.in_degree ?? 0);
    }
  }
  return fanOut;
}
function tryGraphBackend(input, client = createDefaultCodebaseMemoryClient()) {
  if (!client.isAvailable()) {
    return { ok: false, reason: "graph-unavailable" };
  }
  const project = resolveProjectName(client.listProjects(), input.gitRoot);
  if (!project) {
    return { ok: false, reason: "repo-not-indexed" };
  }
  const detect = client.detectChanges(project, { scope: "impact" });
  if (detect === null) {
    return { ok: false, reason: "mcp-timeout" };
  }
  const base = computeHeuristic({
    paths: input.paths,
    proposedAction: input.proposedAction
  });
  const sensitivePaths = input.paths.filter((p) => matchesAnyPattern(p, SENSITIVE_PATH_PATTERNS));
  const estimatedFanOut = estimateGraphFanOut(client, project, input.paths, detect);
  return {
    ok: true,
    output: {
      ...base,
      failure_impact: failureImpactFromFanOut(estimatedFanOut, sensitivePaths)
    }
  };
}

// skills/blast-radius/src/git-diff.ts
var import_node_child_process2 = require("node:child_process");
function listChangedFiles(gitRoot, gitRef = "HEAD") {
  try {
    const out = import_node_child_process2.execFileSync("git", ["diff", "--name-only", gitRef], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return out.toString().split(`
`).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}
function mergePathLists(...lists) {
  const seen = new Set;
  const merged = [];
  for (const list of lists) {
    for (const p of list ?? []) {
      const norm = p.replace(/^\.\//, "");
      if (!seen.has(norm)) {
        seen.add(norm);
        merged.push(norm);
      }
    }
  }
  return merged;
}

// skills/blast-radius/src/render.ts
function backendBanner(envelope) {
  if (envelope.status === "error") {
    return `Blast-radius unavailable (reason: ${envelope.reason}).`;
  }
  const note = envelope.status === "degraded" && envelope.reason ? ` — ${envelope.reason}` : "";
  return `Backend: ${envelope.backend}${note}`;
}
function renderOperatorReport(envelope, preset) {
  const lines = ["## Blast-radius", "", backendBanner(envelope), ""];
  if (envelope.status === "error" || !envelope.output) {
    if (preset === "pre-execution") {
      lines.push("Unknown action risk — confirm with the operator before proceeding.");
    }
    return lines.join(`
`);
  }
  const { change_scope, failure_impact, action_risk } = envelope.output;
  if (preset === "design" || preset === "completion") {
    lines.push(`**Change scope:** ${change_scope.fileCount} file(s), level ${change_scope.level}`, `- Shared infra touches: ${change_scope.sharedInfraFileCount}`, `- Cross-module edits: ${change_scope.crossModuleEditCount}`, `**Failure impact:** level ${failure_impact.level}, estimated fan-out ${failure_impact.estimatedFanOut}`);
    if (failure_impact.sensitivePaths.length) {
      lines.push(`- Sensitive paths: ${failure_impact.sensitivePaths.join(", ")}`);
    }
    if (preset === "design" && shouldFlagDecomposition(change_scope)) {
      lines.push("", "> ⚠️ Scope may warrant splitting into sub-plans — review before approving the approach.");
    }
    lines.push("", `_Action risk (quiet): ${action_risk.level}_`);
  }
  if (preset === "pre-execution") {
    lines.push(`**Action risk:** ${action_risk.level}`, action_risk.tags.length ? `- Tags: ${action_risk.tags.join(", ")}` : "- Tags: (none)");
    if (action_risk.rationale.length) {
      lines.push(...action_risk.rationale.map((r) => `- ${r}`));
    }
    const surface = action_risk.level === "high" || action_risk.level === "medium" && THRESHOLDS.actionRisk.surfaceAt === "medium";
    if (surface) {
      lines.push("", "**Operator confirmation required before this step.**");
    }
    lines.push("", `_Scope: ${change_scope.fileCount} file(s), ${change_scope.level}; impact: ${failure_impact.level}_`);
  }
  return lines.join(`
`);
}

// skills/blast-radius/src/write-envelope.ts
var fs = __toESM(require("node:fs"));
var path2 = __toESM(require("node:path"));
function envelopeScratchPath(gitRoot) {
  return path2.join(gitRoot, ".snowball", "blast-radius", "last.json");
}
function writeLastEnvelope(gitRoot, envelope) {
  const target = envelopeScratchPath(gitRoot);
  fs.mkdirSync(path2.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(envelope, null, 2) + `
`, "utf8");
  return target;
}

// skills/blast-radius/src/compute.ts
function errorEnvelope(reason) {
  return { status: "error", backend: "none", output: null, reason };
}
function computeBlastRadius(input) {
  if (input.explicitSkip) {
    return {
      status: "degraded",
      backend: "none",
      output: null,
      reason: "explicit-skip"
    };
  }
  const gitPaths = input.changeSet.gitRef ? listChangedFiles(input.gitRoot, input.changeSet.gitRef) : listChangedFiles(input.gitRoot, "HEAD");
  const paths = mergePathLists(input.changeSet.paths, gitPaths);
  if (paths.length === 0 && !input.changeSet.proposedAction?.trim()) {
    const env = errorEnvelope("change-untracked");
    assertEnvelope(env);
    return env;
  }
  const graph = tryGraphBackend({
    gitRoot: input.gitRoot,
    paths,
    proposedAction: input.changeSet.proposedAction
  });
  if (graph.ok && graph.output) {
    const env = {
      status: "success",
      backend: "graph",
      output: graph.output,
      reason: null
    };
    assertEnvelope(env);
    return env;
  }
  try {
    const output = computeHeuristic({
      paths,
      proposedAction: input.changeSet.proposedAction
    });
    const env = {
      status: graph.reason ? "degraded" : "success",
      backend: "heuristic",
      output,
      reason: graph.reason ?? null
    };
    assertEnvelope(env);
    return env;
  } catch {
    const env = errorEnvelope("compute-error");
    assertEnvelope(env);
    return env;
  }
}
function computeAndPersist(input) {
  const envelope = computeBlastRadius(input);
  const scratchPath = writeLastEnvelope(input.gitRoot, envelope);
  return { envelope, scratchPath };
}
if (require.main == module) {
  const cmd = process.argv[2];
  const raw = require("node:fs").readFileSync(0, "utf8");
  if (cmd === "compute") {
    const input = JSON.parse(raw || "{}");
    process.stdout.write(JSON.stringify(computeBlastRadius(input), null, 2) + `
`);
  } else if (cmd === "compute-and-persist") {
    const input = JSON.parse(raw || "{}");
    process.stdout.write(JSON.stringify(computeAndPersist(input), null, 2) + `
`);
  } else if (cmd === "render") {
    const { envelope, preset } = JSON.parse(raw || "{}");
    process.stdout.write(renderOperatorReport(envelope, preset) + `
`);
  } else {
    process.stderr.write(`usage: node compute.cjs <compute|compute-and-persist|render>
`);
    process.exit(1);
  }
}
