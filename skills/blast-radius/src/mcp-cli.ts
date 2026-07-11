import { execFileSync } from "node:child_process";
import * as path from "node:path";

const DEFAULT_TIMEOUT_MS = 15_000;

export interface CbmProject {
  name: string;
  root_path: string;
}

export interface CbmGraphNode {
  name: string;
  qualified_name?: string;
  label?: string;
  file_path?: string;
  in_degree?: number;
  out_degree?: number;
}

export interface DetectChangesResult {
  changed_files?: string[];
  changed_count?: number;
  impacted_symbols?: Array<{ name?: string; label?: string; file?: string }>;
  depth?: number;
  hint?: string;
}

export interface SearchGraphResult {
  total?: number;
  results?: CbmGraphNode[];
}

export interface CodebaseMemoryClient {
  isAvailable(): boolean;
  listProjects(): CbmProject[];
  detectChanges(
    project: string,
    opts?: { scope?: string; base_branch?: string },
  ): DetectChangesResult | null;
  searchGraph(
    project: string,
    opts: { file_pattern?: string; label?: string; limit?: number; paths?: string[] },
  ): SearchGraphResult | null;
}

// ── Selector (PR 1) ────────────────────────────────────────────────────────

export type BackendId = "yactt" | "codebase-memory" | "heuristic";

/**
 * Resolve which graph backend to try first.
 *
 * - `BLAST_RADIUS_DISABLE_GRAPH=1` (legacy) maps to "heuristic".
 * - `SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND` ∈ `yactt` | `codebase-memory` | `heuristic`.
 * - Default is `yactt` (phased migration per spec; auto-fall-back to codebase-memory handles
 *   the case where yactt isn't installed or the repo isn't yactt-indexed).
 */
export function resolveBackendId(): BackendId {
  if (process.env.BLAST_RADIUS_DISABLE_GRAPH === "1") return "heuristic";
  const sel = process.env.SNOWBALL_BLAST_RADIUS_GRAPH_BACKEND?.trim();
  if (sel === "yactt" || sel === "codebase-memory" || sel === "heuristic") return sel;
  return "yactt";
}

/** Auto-fallback is on by default. Set `SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK=0` to disable. */
export function fallbackEnabled(): boolean {
  return process.env.SNOWBALL_BLAST_RADIUS_GRAPH_FALLBACK !== "0";
}

/**
 * Returns the client the selector points to, or `null` for heuristic-only.
 * Consumers should NOT call this multiple times per request — the chain
 * fallback lives in graph-backend.ts.
 */
export function resolveBackendClient(gitRoot?: string): CodebaseMemoryClient | null {
  const sel = resolveBackendId();
  if (sel === "heuristic") return null;
  if (sel === "codebase-memory") return createDefaultCodebaseMemoryClient();
  return createYacttClient(gitRoot ?? process.cwd());
}

// ── codebase-memory client (preserved; called via createDefault… + chained fallback) ──

function resolveCliBinary(): string | null {
  if (process.env.BLAST_RADIUS_DISABLE_GRAPH === "1") return null;
  const configured = process.env.CBM_CLI_PATH?.trim();
  if (configured) return configured;
  return "codebase-memory-mcp";
}

function runCliTool<T>(binary: string, tool: string, args: Record<string, unknown>): T | null {
  try {
    const out = execFileSync(binary, ["cli", tool, JSON.stringify(args)], {
      encoding: "utf8",
      timeout: DEFAULT_TIMEOUT_MS,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const trimmed = out.trim();
    if (!trimmed) return null;
    return JSON.parse(trimmed) as T;
  } catch {
    return null;
  }
}

export function createDefaultCodebaseMemoryClient(): CodebaseMemoryClient {
  const binary = resolveCliBinary();
  if (!binary) {
    return {
      isAvailable: () => false,
      listProjects: () => [],
      detectChanges: () => null,
      searchGraph: () => null,
    };
  }

  return {
    isAvailable: () => {
      try {
        execFileSync(binary, ["--version"], {
          encoding: "utf8",
          timeout: 5000,
          stdio: ["ignore", "pipe", "ignore"],
        });
        return true;
      } catch {
        return false;
      }
    },
    listProjects: () => {
      const parsed = runCliTool<{ projects?: CbmProject[] }>(binary, "list_projects", {});
      return parsed?.projects ?? [];
    },
    detectChanges: (project, opts) =>
      runCliTool<DetectChangesResult>(binary, "detect_changes", {
        project,
        scope: opts?.scope ?? "impact",
        ...(opts?.base_branch ? { base_branch: opts.base_branch } : {}),
      }),
    searchGraph: (project, opts) =>
      runCliTool<SearchGraphResult>(binary, "search_graph", {
        project,
        ...opts,
      }),
  };
}

// ── yactt client (default; shells out to the Deno shim installed at extensions/snowball/yactt-cli) ─

function resolveYacttBinary(): string {
  // The cli accepts YACTT_BIN to point at the yactt binary (the Go executable),
  // but by convention we let it auto-resolve on $PATH.
  return process.env.YACTT_BIN?.trim() || "yactt";
}

function runYacttCli(
  tool: string,
  args: string[],
  gitRoot: string,
): { ok: true; json: unknown } | { ok: false; reason: string } {
  // The shim is a Deno script. PR 1 invokes it via `deno run`; later a built
  // binary can replace this (a `yactt-cli` on $PATH overrides via
  // `YACTT_CLI_PATH`).
  const denoBin = process.env.DENO_BIN?.trim() || "deno";
  const shim = process.env.YACTT_CLI_PATH?.trim()
    || path.join(
      import.meta.dirname || path.dirname(new URL(import.meta.url).pathname),
      "..", "..", "..",
      "extensions", "snowball", "yactt-cli", "cli.ts",
    );
  try {
    const out = execFileSync(
      denoBin,
      ["run", "--allow-net", "--allow-read", "--allow-write", "--allow-env", shim, tool, "--repo", gitRoot, ...args],
      { encoding: "utf8", timeout: DEFAULT_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] },
    );
    const trimmed = out.trim();
    if (!trimmed) return { ok: false, reason: "graph-unavailable" };
    return { ok: true, json: JSON.parse(trimmed) };
  } catch (e: any) {
    const stderr = ((e?.stderr ?? "") as string).toString();
    if (/repo-not-indexed/i.test(stderr))  return { ok: false, reason: "repo-not-indexed" };
    if (/graph-unavailable/i.test(stderr)) return { ok: false, reason: "graph-unavailable" };
    if (/mcp-timeout/i.test(stderr))       return { ok: false, reason: "mcp-timeout" };
    return { ok: false, reason: "graph-unavailable" };
  }
}

export function createYacttClient(gitRoot: string): CodebaseMemoryClient {
  // yactt binds the active repo via `yactt mcp serve <path>` at server start;
  // each shim invocation gets the same --repo flag.
  return {
    isAvailable: () => {
      try {
        execFileSync(resolveYacttBinary(), ["--version"], {
          encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "ignore"],
        });
        return true;
      } catch {
        return false;
      }
    },
    listProjects: () => {
      // Single-repo binding. graph-backend.ts will resolve against gitRoot directly.
      return [{ name: "yactt-active", root_path: gitRoot }];
    },
    detectChanges: (_project: string, _opts?: { scope?: string; base_branch?: string }) => {
      // yactt has no direct `detect_changes` analog; PR 1 returns null and
      // graph-backend.ts falls through to heuristic when this fails. PR 2
      // introduces a dedicated shim subcommand.
      return null;
    },
    searchGraph: (_project: string, opts: { file_pattern?: string; limit?: number; paths?: string[] }) => {
      const patterns = opts.paths ?? (opts.file_pattern ? [opts.file_pattern] : []);
      const file_pattern = patterns.join(",");
      const args = ["--file-pattern", file_pattern, "--limit", String(opts.limit ?? 50)];
      const r = runYacttCli("search-symbols", args, gitRoot);
      if (!r.ok) return null;
      return r.json as SearchGraphResult;
    },
  };
}

// ── shared helpers (unchanged) ─────────────────────────────────────────────

export function resolveProjectName(projects: CbmProject[], gitRoot: string): string | null {
  const normalizedRoot = path.resolve(gitRoot);
  for (const p of projects) {
    if (path.resolve(p.root_path) === normalizedRoot) return p.name;
  }
  return null;
}
