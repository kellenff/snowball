import * as fs from "node:fs";
import * as path from "node:path";

/** Canonical on-disk ADR path (Snowball-owned; no external MCP store). */
export function diskCachePath(gitRoot: string): string {
  return path.join(gitRoot, ".snowball", "adr.md");
}

/** Legacy path written by older sync runs that used codebase-memory. */
export function legacyDiskCachePath(gitRoot: string): string {
  return path.join(gitRoot, ".codebase-memory", "adr.md");
}

/**
 * Resolve which ADR file exists: prefer `.snowball/adr.md`, else legacy
 * `.codebase-memory/adr.md`. Returns null when neither exists.
 */
export function resolveAdrPath(gitRoot: string): string | null {
  const primary = diskCachePath(gitRoot);
  if (fs.existsSync(primary)) return primary;
  const legacy = legacyDiskCachePath(gitRoot);
  if (fs.existsSync(legacy)) return legacy;
  return null;
}

/** Read ADR content from the resolved path, or "" when none exists. */
export function readAdrContent(gitRoot: string): string {
  const resolved = resolveAdrPath(gitRoot);
  if (!resolved) return "";
  return fs.readFileSync(resolved, "utf8");
}

export function writeDiskCache(gitRoot: string, content: string): void {
  const target = diskCachePath(gitRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, target);
}
