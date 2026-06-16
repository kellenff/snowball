import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { runMadrCapture } from "./tools/madr-capture.js";
import { runApprovalPhraseRecord } from "./tools/approval-phrase-record.js";
import { runObservationLog } from "./tools/observation-log.js";

const server = new Server(
  { name: "snowball-capture", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "madr_capture",
      description:
        "Captures an AskUserQuestion-equivalent exchange as a MADR file under docs/snowball/decisions/.",
      inputSchema: {
        type: "object",
        properties: {
          question: { type: "string" },
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                description: { type: "string" },
              },
              required: ["name", "description"],
            },
          },
          chosen: { type: "string" },
          context: { type: "string" },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["question", "options", "chosen"],
      },
    },
    {
      name: "approval_phrase_record",
      description:
        "Captures an approval phrase (lgtm, ship it, etc.) as a MADR with capture_mechanism=user-prompt-pattern. Refuses non-matching phrases with NOT_AN_APPROVAL.",
      inputSchema: {
        type: "object",
        properties: {
          phrase: { type: "string" },
          action: { type: "string" },
          context: { type: "string" },
        },
        required: ["phrase", "action"],
      },
    },
    {
      name: "observation_log",
      description:
        "Appends a single observation line to docs/snowball/decisions/observations.jsonl.",
      inputSchema: {
        type: "object",
        properties: {
          content: { type: "string" },
          type: {
            type: "string",
            enum: ["observation", "implementation-choice", "hypothesis", "constraint"],
          },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          rationale: { type: "string" },
          related_files: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
        },
        required: ["content", "type", "confidence", "rationale"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  let result;
  switch (name) {
    case "madr_capture":
      result = runMadrCapture(args);
      break;
    case "approval_phrase_record":
      result = runApprovalPhraseRecord(args);
      break;
    case "observation_log":
      result = runObservationLog(args);
      break;
    default:
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ ok: false, code: "INTERNAL", error: `unknown tool: ${name}` }),
          },
        ],
        isError: true,
      };
  }
  return {
    content: [{ type: "text", text: JSON.stringify(result) }],
    isError: !result.ok,
  };
});

const transport = new StdioServerTransport();

(async () => {
  await server.connect(transport).catch((err: unknown) => {
    console.error("snowball-capture: failed to start", err);
    process.exit(1);
  });
})();
