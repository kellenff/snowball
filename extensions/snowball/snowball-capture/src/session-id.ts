import { randomUUID } from "node:crypto";

// One UUID per MCP-server process; held in module scope so all tool calls
// in the same Junie session share a single session_id, matching the
// per-session invariant of the existing capture pipeline.
export const SESSION_ID: string = randomUUID();
