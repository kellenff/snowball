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

// skills/decision-logging/src/approval-phrases.ts
var exports_approval_phrases = {};
__export(exports_approval_phrases, {
  matchesApproval: () => matchesApproval,
  APPROVAL_PHRASES: () => APPROVAL_PHRASES
});
module.exports = __toCommonJS(exports_approval_phrases);
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
