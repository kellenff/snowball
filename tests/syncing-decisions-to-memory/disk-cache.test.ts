import { test, expect } from "bun:test";
import * as fs from "node:fs";
import {
  writeDiskCache,
  diskCachePath,
} from "../../skills/syncing-decisions-to-memory/src/disk-cache";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("writeDiskCache creates .codebase-memory/adr.md", () => {
  const repo = makeTempRepo();
  try {
    const content = "## PHILOSOPHY\n\nCached ADR.\n";
    writeDiskCache(repo, content);
    const p = diskCachePath(repo);
    expect(fs.existsSync(p)).toBe(true);
    expect(fs.readFileSync(p, "utf8")).toBe(content);
  } finally {
    cleanupTempRepo(repo);
  }
});

test("writeDiskCache overwrites existing cache", () => {
  const repo = makeTempRepo();
  try {
    writeDiskCache(repo, "v1");
    writeDiskCache(repo, "v2");
    expect(fs.readFileSync(diskCachePath(repo), "utf8")).toBe("v2");
  } finally {
    cleanupTempRepo(repo);
  }
});
