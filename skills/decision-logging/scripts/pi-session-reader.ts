import { readFileSync } from "node:fs";

type PiEntry = {
  id: string;
  parentId: string | null;
  type: string;
  timestamp?: number;
  message?: {
    role?: string;
    content?: Array<{ type: string; text?: string }>;
  };
};

const flattenText = (content: PiEntry["message"]["content"]): string => {
  if (!Array.isArray(content)) return "";
  return content
    .filter((part) => part && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("")
    .trim();
};

// Pick the active leaf deterministically. Prefers entries with no children
// (true leaves), tiebreaks on timestamp descending. Handles multi-root
// session files where JSONL write order doesn't reflect chain activity
// (compaction, regeneration, or stale appends).
const pickLeaf = (entries: PiEntry[]): PiEntry | null => {
  if (entries.length === 0) return null;
  const childCount = new Map<string, number>();
  for (const e of entries) {
    const key = e.id;
    childCount.set(key, childCount.get(key) ?? 0);
  }
  for (const e of entries) {
    const parentKey = e.parentId ?? "__root__";
    childCount.set(parentKey, (childCount.get(parentKey) ?? 0) + 1);
  }
  const trueLeaves = entries.filter((e) => (childCount.get(e.id) ?? 0) === 0);
  const candidates = trueLeaves.length > 0 ? trueLeaves : entries;
  candidates.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
  return candidates[0];
};

const walkBranch = (entries: PiEntry[]): PiEntry[] => {
  const leaf = pickLeaf(entries);
  if (!leaf) return [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const chain: PiEntry[] = [];
  let cursor: PiEntry | undefined = leaf;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
  }
  if (chain[0].parentId !== null) {
    throw new Error(
      `pi session walk ended at non-root entry ${chain[0].id} (parentId=${chain[0].parentId}); ` +
      `file may be out of order or contain dangling parentId references`,
    );
  }
  return chain;
};

export const serializePiSession = (sessionFilePath: string): string => {
  const raw = readFileSync(sessionFilePath, "utf8");
  const lines = raw.split("\n").filter((l) => l.trim().length > 0);
  const entries = lines.map((l) => JSON.parse(l) as PiEntry);
  const branch = walkBranch(entries);
  const out: string[] = [];
  for (const entry of branch) {
    const role = entry.message?.role;
    const text = flattenText(entry.message?.content);
    if (!role || !text) continue;
    out.push(JSON.stringify({ role, content: text }));
  }
  return out.join("\n");
};
