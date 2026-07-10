import { readFileSync } from "node:fs";

type PiEntry = {
  id: string;
  parentId: string | null;
  type: string;
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

const walkBranch = (entries: PiEntry[]): PiEntry[] => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const leaf = entries[entries.length - 1];
  if (!leaf) return [];
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
