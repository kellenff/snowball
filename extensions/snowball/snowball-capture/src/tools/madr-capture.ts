import { writeMadr } from "../../../../../skills/decision-logging/src/write-madr.js";
import { err, ok, type ToolResult } from "../errors.js";
import { MadrCaptureInput, type MadrCaptureInput as T } from "../schemas.js";
import { SESSION_ID } from "../session-id.js";
import { randomUUID } from "node:crypto";

export interface MadrCaptureOutput {
  path: string;
  id: string;
}

export function runMadrCapture(raw: unknown): ToolResult<MadrCaptureOutput> {
  const parsed = MadrCaptureInput.safeParse(raw);
  if (!parsed.success) {
    return err("INVALID_INPUT", parsed.error.message);
  }
  const input: T = parsed.data;

  if (!input.options.some((o) => o.name === input.chosen)) {
    return err("INVALID_INPUT", `chosen "${input.chosen}" not in options`);
  }

  const chosenOpt = input.options.find((o) => o.name === input.chosen)!;
  const rejected = input.options.filter((o) => o.name !== input.chosen);

  const title = input.question.length > 80 ? input.question.slice(0, 77) + "..." : input.question;

  const now = new Date().toISOString();

  try {
    const path = writeMadr({
      title,
      status: "accepted",
      date: now,
      deciders: ["kellen"],
      snowball: {
        schema_version: "1.1",
        source: "operator",
        confidence: "high",
        capture_mechanism: "ask-user-question",
        session_id: SESSION_ID,
        source_event_id: randomUUID(),
        supersedes: null,
        tags: ["ambient", ...(input.tags ?? [])],
      },
      body: {
        context:
          input.context ?? "Captured from a Junie session via the snowball-capture MCP server.",
        considered_options: [
          ...rejected.map((o) => ({ name: o.name, description: o.description })),
          { name: chosenOpt.name, description: chosenOpt.description },
        ],
        decision_outcome: `Chose **${chosenOpt.name}** — ${chosenOpt.description}.`,
        consequences: [],
        links: [],
      },
    });
    return ok({ path, id: SESSION_ID });
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    if (msg.includes("not in a git repo")) return err("NOT_IN_GIT_REPO", msg);
    if (msg.includes("EACCES") || msg.includes("ENOSPC")) return err("WRITE_FAILED", msg);
    return err("INTERNAL", msg);
  }
}

if (import.meta.main) {
  let raw = "";
  process.stdin.on("data", (c) => (raw += c.toString()));
  process.stdin.on("end", () => {
    try {
      const input = JSON.parse(raw);
      const out = runMadrCapture(input);
      process.stdout.write(JSON.stringify(out) + "\n");
      if (!out.ok) process.exit(1);
    } catch (e) {
      const msg = (e as Error).message ?? String(e);
      process.stdout.write(JSON.stringify({ ok: false, code: "INTERNAL", error: msg }) + "\n");
      process.exit(1);
    }
  });
}
