import * as path from "node:path";
import { pathToFileURL } from "node:url";

const PROTOCOL = "2025-03-26";
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MCP_URL = "http://127.0.0.1:57812/mcp";

export interface YacttProject {
  name: string;
  path: string;
}

export interface YacttDetectChange {
  file: string;
  symbol?: { id?: string; name?: string; kind?: string };
  callers?: Array<{ targetId?: string; location?: { file?: string } }>;
  tests?: unknown[];
  overrides?: unknown[];
}

export interface YacttDetectChangesResult {
  changes?: YacttDetectChange[];
  files?: unknown[];
  base?: string;
  head?: string;
  truncated?: boolean;
}

export interface YacttSymbolOverview {
  id: string;
  kind: string;
  name: string;
  summary?: string;
}

export interface YacttSymbolsOverviewResult {
  symbols?: YacttSymbolOverview[];
  file?: string;
}

export interface YacttReference {
  edgeKind: string;
  targetId: string;
  location?: { file?: string };
}

export interface YacttFindReferencingResult {
  references?: YacttReference[];
  truncated?: boolean;
  totalCount?: number;
}

export interface YacttGraphClient {
  isAvailable(): Promise<boolean>;
  listProjects(): Promise<YacttProject[]>;
  detectChanges(
    projectUri: string,
    opts: { since?: string; base?: string; head?: string; limit?: number },
  ): Promise<YacttDetectChangesResult | null>;
  getSymbolsOverview(projectUri: string, file: string): Promise<YacttSymbolsOverviewResult | null>;
  findReferencingSymbols(
    projectUri: string,
    symbol: string,
    opts?: { kinds?: string[]; limit?: number },
  ): Promise<YacttFindReferencingResult | null>;
}

function resolveMcpUrl(): string | null {
  if (process.env.BLAST_RADIUS_DISABLE_GRAPH === "1") return null;
  const configured = process.env.YACTT_MCP_URL?.trim();
  return configured || DEFAULT_MCP_URL;
}

function timeoutMs(): number {
  const raw = process.env.BLAST_RADIUS_MCP_TIMEOUT_MS?.trim();
  if (!raw) return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

export function projectUriFromRoot(gitRoot: string): string {
  return pathToFileURL(path.resolve(gitRoot)).href;
}

export function isRepoIndexed(projects: YacttProject[], gitRoot: string): boolean {
  const root = path.resolve(gitRoot);
  return projects.some((p) => path.resolve(p.path) === root);
}

class YacttMcpSession {
  private sessionId: string | undefined;
  private rpcId = 1;

  constructor(
    private readonly mcpUrl: string,
    private readonly token: string | undefined,
  ) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    if (this.sessionId) {
      h["Mcp-Session-Id"] = this.sessionId;
      h["Mcp-Protocol-Version"] = PROTOCOL;
    }
    if (this.token) h.Authorization = `Bearer ${this.token}`;
    return h;
  }

  private async post(body: unknown): Promise<Response> {
    return fetch(this.mcpUrl, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  }

  async ensureSession(): Promise<void> {
    if (this.sessionId) return;
    const init = await this.post({
      jsonrpc: "2.0",
      id: this.rpcId++,
      method: "initialize",
      params: {
        protocolVersion: PROTOCOL,
        capabilities: {},
        clientInfo: { name: "snowball-blast-radius", version: "1.0" },
      },
    });
    this.sessionId = init.headers.get("Mcp-Session-Id") ?? undefined;
    if (!this.sessionId) throw new Error("missing Mcp-Session-Id");

    const notif = await this.post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    if (notif.status !== 204 && notif.body) {
      await notif.arrayBuffer();
    }
  }

  async callTool<T>(name: string, args: Record<string, unknown>): Promise<T | null> {
    try {
      await this.ensureSession();
      const res = await this.post({
        jsonrpc: "2.0",
        id: this.rpcId++,
        method: "tools/call",
        params: { name, arguments: args },
      });
      if (!res.ok) return null;
      const frame = (await res.json()) as {
        error?: unknown;
        result?: {
          structuredContent?: T;
          content?: Array<{ type: string; text?: string }>;
        };
      };
      if (frame.error) return null;
      if (frame.result?.structuredContent) return frame.result.structuredContent;
      const text = frame.result?.content?.find((c) => c.type === "text")?.text;
      return text ? (JSON.parse(text) as T) : null;
    } catch {
      return null;
    }
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    try {
      await fetch(this.mcpUrl, {
        method: "DELETE",
        headers: this.headers(),
        signal: AbortSignal.timeout(3000),
      });
    } catch {
      // idle reap is fine
    } finally {
      this.sessionId = undefined;
    }
  }
}

export function createDefaultYacttGraphClient(): YacttGraphClient {
  const mcpUrl = resolveMcpUrl();
  if (!mcpUrl) {
    return {
      isAvailable: async () => false,
      listProjects: async () => [],
      detectChanges: async () => null,
      getSymbolsOverview: async () => null,
      findReferencingSymbols: async () => null,
    };
  }

  const token = process.env.YACTT_MCP_TOKEN?.trim() || undefined;
  let session: YacttMcpSession | null = null;

  const getSession = (): YacttMcpSession => {
    if (!session) session = new YacttMcpSession(mcpUrl, token);
    return session;
  };

  return {
    isAvailable: async () => {
      try {
        const health = new URL("/healthz", mcpUrl);
        const res = await fetch(health, { signal: AbortSignal.timeout(3000) });
        return res.ok;
      } catch {
        return false;
      }
    },
    listProjects: async () => {
      const parsed = await getSession().callTool<{ projects?: YacttProject[] }>(
        "list_projects",
        {},
      );
      return parsed?.projects ?? [];
    },
    detectChanges: async (projectUri, opts) => {
      const args: Record<string, unknown> = { project: projectUri };
      if (opts.since) args.since = opts.since;
      if (opts.base) args.base = opts.base;
      if (opts.head) args.head = opts.head;
      if (opts.limit != null) args.limit = opts.limit;
      return getSession().callTool<YacttDetectChangesResult>("detect_changes", args);
    },
    getSymbolsOverview: async (projectUri, file) =>
      getSession().callTool<YacttSymbolsOverviewResult>("get_symbols_overview", {
        project: projectUri,
        file,
      }),
    findReferencingSymbols: async (projectUri, symbol, opts) =>
      getSession().callTool<YacttFindReferencingResult>("find_referencing_symbols", {
        project: projectUri,
        symbol,
        kinds: opts?.kinds ?? ["callers"],
        ...(opts?.limit != null ? { limit: opts.limit } : {}),
      }),
  };
}
