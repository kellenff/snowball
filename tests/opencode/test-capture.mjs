// Verifies the OpenCode plugin's decision-logging + blast-radius capture hooks:
//   chat.message → approval MADR + operator-approval blast-radius audit (+ dedup)
//   event:session.idle → stop blast-radius audit (once per turn) + extraction
// Run against an installed plugin file so it also exercises the hooks/ copy.
//
// Usage: node test-capture.mjs PLUGIN_PATH
import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";
import { pathToFileURL } from "url";

const [, , pluginPath] = process.argv;
if (!pluginPath) {
  console.error("Usage: node test-capture.mjs PLUGIN_PATH");
  process.exit(2);
}

// Keep extraction fast + hermetic: the worker shells out to $SNOWBALL_CLAUDE_BIN.
process.env.SNOWBALL_CLAUDE_BIN = process.env.SNOWBALL_CLAUDE_BIN || "true";

const failures = [];
const assert = (cond, msg) => {
  if (!cond) failures.push(msg);
};

const repo = fs.mkdtempSync(path.join(os.tmpdir(), "snowball-oc-capture-"));
const git = (...args) => execFileSync("git", args, { cwd: repo, stdio: "ignore" });
git("init", "-q");
git("config", "user.email", "t@t");
git("config", "user.name", "t");

// Seed a valid blast-radius envelope so the audit has something to capture.
const blastDir = path.join(repo, ".snowball", "blast-radius");
fs.mkdirSync(blastDir, { recursive: true });
fs.writeFileSync(
  path.join(blastDir, "last.json"),
  JSON.stringify({ status: "degraded", backend: "none", reason: "explicit-skip", output: null }),
);

const decisionsDir = path.join(repo, "docs", "snowball", "decisions");
const obsPath = path.join(decisionsDir, "observations.jsonl");
const madrFiles = () =>
  fs.existsSync(decisionsDir)
    ? fs.readdirSync(decisionsDir).filter((f) => f.endsWith(".md"))
    : [];
const obsLines = () =>
  fs.existsSync(obsPath)
    ? fs
        .readFileSync(obsPath, "utf8")
        .split("\n")
        .filter((l) => l.trim())
        .map((l) => JSON.parse(l))
    : [];

const fakeClient = {
  session: {
    messages: async () => [
      { info: { role: "user" }, parts: [{ type: "text", text: "lgtm" }] },
      { info: { role: "assistant" }, parts: [{ type: "text", text: "done" }] },
    ],
  },
};

const mod = await import(pathToFileURL(pluginPath).href);
const plugin = await mod.SnowballPlugin({
  client: fakeClient,
  worktree: repo,
  directory: "/tmp", // deliberately NOT the repo, to prove worktree wins (R1)
  project: { worktree: repo },
});

const chatMessage = plugin["chat.message"];
const event = plugin["event"];

// --- A: approval phrase captures a MADR + operator-approval audit ---
await chatMessage(
  {},
  { message: { id: "m1", role: "user", sessionID: "sess1" }, parts: [{ type: "text", text: "lgtm" }] },
);
assert(madrFiles().length === 1, `A: expected 1 MADR after approval, got ${madrFiles().length}`);
if (madrFiles().length === 1) {
  const content = fs.readFileSync(path.join(decisionsDir, madrFiles()[0]), "utf8");
  assert(
    /capture_mechanism: user-prompt-pattern/.test(content),
    "A: MADR missing user-prompt-pattern mechanism",
  );
}
let obs = obsLines();
assert(
  obs.length === 1 && obs[0].capture_trigger === "operator-approval",
  `A: expected 1 operator-approval observation, got ${JSON.stringify(obs.map((o) => o.capture_trigger))}`,
);

// --- B: re-delivering the same message id is deduped (no new capture) ---
await chatMessage(
  {},
  { message: { id: "m1", role: "user", sessionID: "sess1" }, parts: [{ type: "text", text: "lgtm" }] },
);
assert(madrFiles().length === 1, `B: dedup failed, MADR count = ${madrFiles().length}`);
assert(obsLines().length === 1, `B: dedup failed, observation count = ${obsLines().length}`);

// --- C: session.idle fires the stop audit once for the armed turn ---
await event({ event: { type: "session.idle", properties: { sessionID: "sess1" } } });
obs = obsLines();
assert(
  obs.length === 2 && obs[1].capture_trigger === "stop",
  `C: expected a stop observation, got ${JSON.stringify(obs.map((o) => o.capture_trigger))}`,
);

// --- D: a second idle for the same turn is deduped ---
await event({ event: { type: "session.idle", properties: { sessionID: "sess1" } } });
assert(obsLines().length === 2, `D: idle dedup failed, observation count = ${obsLines().length}`);

// --- E: a non-approval prompt writes nothing ---
await chatMessage(
  {},
  {
    message: { id: "m2", role: "user", sessionID: "sess1" },
    parts: [{ type: "text", text: "what should we do next?" }],
  },
);
assert(madrFiles().length === 1, `E: non-approval wrote a MADR (count = ${madrFiles().length})`);
assert(obsLines().length === 2, `E: non-approval wrote an observation (count = ${obsLines().length})`);

// --- F: assistant-role messages are ignored ---
await chatMessage(
  {},
  {
    message: { id: "m3", role: "assistant", sessionID: "sess1" },
    parts: [{ type: "text", text: "lgtm" }],
  },
);
assert(madrFiles().length === 1, `F: assistant message captured (MADR count = ${madrFiles().length})`);

fs.rmSync(repo, { recursive: true, force: true });

if (failures.length) {
  for (const f of failures) console.error(`FAIL: ${f}`);
  process.exit(1);
}
console.log("All OpenCode capture assertions passed.");
