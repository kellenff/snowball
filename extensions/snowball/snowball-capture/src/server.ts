import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const server = new Server(
  {
    name: "snowball-capture",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

const transport = new StdioServerTransport();

(async () => {
  await server.connect(transport).catch((err: unknown) => {
    console.error("snowball-capture: failed to start", err);
    process.exit(1);
  });
})();
