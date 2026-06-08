import { test, expect } from "bun:test";
import { renderAdr } from "../../skills/syncing-decisions-to-memory/src/adr";
import { writeDiskCache } from "../../skills/syncing-decisions-to-memory/src/disk-cache";
import { renderExcerptForHook } from "../../skills/recalling-project-context/src/recall-context";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("sync disk cache is readable by recall excerpt hook", () => {
  const repo = makeTempRepo();
  try {
    const doc = renderAdr({
      preserved: {},
      tradeoffs: "Prefer passive hooks over active logging.",
      philosophy: "Capture is a side effect of working.",
      digest: "abc123def4567890",
    });
    writeDiskCache(repo, doc);
    const excerpt = renderExcerptForHook({ gitRoot: repo });
    expect(excerpt).toContain("<project-memory>");
    expect(excerpt).toContain("passive hooks");
    expect(excerpt).toContain("side effect");
    expect(excerpt).toContain("abc123def4567890");
  } finally {
    cleanupTempRepo(repo);
  }
});
