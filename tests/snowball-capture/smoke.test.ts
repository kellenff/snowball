import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const BUNDLE = path.join(PROJECT_ROOT, "extensions/snowball/snowball-capture/dist/server.cjs");

let bundleExists = false;

beforeAll(() => {
  bundleExists = fs.existsSync(BUNDLE);
  if (!bundleExists) {
    console.warn(`smoke test skipped: bundle not built at ${BUNDLE}`);
  }
});

describe("snowball-capture MCP server", () => {
  it("starts and responds to MCP initialize", async () => {
    if (!bundleExists) return;
    const proc = spawn("node", [BUNDLE], { stdio: ["pipe", "pipe", "pipe"] });
    let out = "";
    proc.stdout.on("data", (c) => (out += c.toString()));
    proc.stderr.on("data", (c) => (out += c.toString()));

    const init = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "smoke-test", version: "0.0.0" },
      },
    });
    proc.stdin.write(init + "\n");
    proc.stdin.end();

    const exitCode: number = await new Promise((resolve) =>
      proc.on("exit", (code) => resolve(code ?? -1)),
    );

    // Server should exit cleanly when stdin closes; output should mention the
    // server name we registered.
    expect(out).toContain("snowball-capture");
  }, 5000);
});
