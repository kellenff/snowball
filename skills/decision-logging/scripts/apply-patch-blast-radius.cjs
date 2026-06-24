var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key) {
  return this[key];
}
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

// skills/decision-logging/src/apply-patch-blast-radius.ts
var exports_apply_patch_blast_radius = {};
__export(exports_apply_patch_blast_radius, {
  classifyPatchRisk: () => classifyPatchRisk
});
module.exports = __toCommonJS(exports_apply_patch_blast_radius);
var LOCKFILE_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^\.terraform\.lock\.hcl$/,
  /^Cargo\.lock$/,
  /^go\.sum$/,
  /^composer\.lock$/
];
var PROTECTED_PATH_PATTERNS = [
  /^hooks\//,
  /^\.vtcode\/hooks\.toml$/,
  /^\.github\//
];
var HIGH_RISK_FILE_COUNT = 10;
function extractTouchedPaths(patch) {
  const paths = new Set;
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  for (const m of patch.matchAll(re)) {
    paths.add(m[1]);
  }
  return [...paths];
}
function classifyPatchRisk(patch) {
  const reasons = [];
  const severe = [];
  const touched = extractTouchedPaths(patch);
  if (touched.length >= HIGH_RISK_FILE_COUNT) {
    severe.push(`touches ${touched.length} files (threshold: ${HIGH_RISK_FILE_COUNT})`);
  }
  for (const p of touched) {
    if (LOCKFILE_PATTERNS.some((re) => re.test(p))) {
      severe.push(`modifies lockfile: ${p}`);
    }
    if (PROTECTED_PATH_PATTERNS.some((re) => re.test(p))) {
      severe.push(`modifies protected path: ${p}`);
    }
  }
  const allReasons = [...severe, ...reasons];
  const risk = severe.length > 0 ? "high" : allReasons.length === 0 ? "low" : "medium";
  return { risk, reasons: allReasons };
}
if (require.main == module || require.main == module) {
  let raw = "";
  process.stdin.on("data", (chunk) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      process.stdout.write(`RISK=low
REASONS=
`);
      process.exit(0);
      return;
    }
    const input = payload.tool_input ?? payload;
    const patch = input && typeof input === "object" && typeof input.patch === "string" ? input.patch : "";
    const verdict = classifyPatchRisk(patch);
    process.stdout.write(`RISK=${verdict.risk}
REASONS=${verdict.reasons.join("|")}
`);
    process.exit(0);
  });
}
