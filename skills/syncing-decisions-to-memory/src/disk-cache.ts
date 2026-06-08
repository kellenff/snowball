import * as fs from "node:fs";
import * as path from "node:path";

export function diskCachePath(gitRoot: string): string {
  return path.join(gitRoot, ".codebase-memory", "adr.md");
}

export function writeDiskCache(gitRoot: string, content: string): void {
  const target = diskCachePath(gitRoot);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, content, "utf8");
  fs.renameSync(tmp, target);
}
