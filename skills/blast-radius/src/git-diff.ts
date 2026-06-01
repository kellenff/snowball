import { execFileSync } from "node:child_process";

export function listChangedFiles(gitRoot: string, gitRef = "HEAD"): string[] {
  try {
    const out = execFileSync("git", ["diff", "--name-only", gitRef], {
      cwd: gitRoot,
      stdio: ["ignore", "pipe", "ignore"],
    });
    return out
      .toString()
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export function mergePathLists(...lists: Array<string[] | undefined>): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const p of list ?? []) {
      const norm = p.replace(/^\.\//, "");
      if (!seen.has(norm)) {
        seen.add(norm);
        merged.push(norm);
      }
    }
  }
  return merged;
}
