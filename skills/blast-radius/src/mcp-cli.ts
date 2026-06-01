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
    opts: { file_pattern?: string; label?: string; limit?: number },
  ): SearchGraphResult | null;
}

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

export function resolveProjectName(projects: CbmProject[], gitRoot: string): string | null {
  const normalizedRoot = path.resolve(gitRoot);
  for (const p of projects) {
    if (path.resolve(p.root_path) === normalizedRoot) return p.name;
  }
  return null;
}
