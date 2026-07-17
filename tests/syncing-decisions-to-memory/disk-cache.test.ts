import { test, expect } from "bun:test";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  writeDiskCache,
  diskCachePath,
  readAdrContent,
  resolveAdrPath,
  legacyDiskCachePath,
} from "../../skills/syncing-decisions-to-memory/src/disk-cache";
import { makeTempRepo, cleanupTempRepo } from "./test-helpers";

test("writeDiskCache creates .snowball/adr.md", () => {
  const repo = makeTempRepo();
  try {
    const content = "## PHILOSOPHY\n\nCached ADR.\n";
    writeDiskCache(repo, content);
    const p = diskCachePath(repo);
    expect(p).toBe(path.join(repo, ".snowball", "adr.md"));
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

test("readAdrContent falls back to legacy .codebase-memory/adr.md", () => {
  const repo = makeTempRepo();
  try {
    const legacy = legacyDiskCachePath(repo);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "## PHILOSOPHY\n\nLegacy.\n", "utf8");
    expect(resolveAdrPath(repo)).toBe(legacy);
    expect(readAdrContent(repo)).toBe("## PHILOSOPHY\n\nLegacy.\n");
  } finally {
    cleanupTempRepo(repo);
  }
});

test("readAdrContent prefers .snowball/adr.md over legacy", () => {
  const repo = makeTempRepo();
  try {
    const legacy = legacyDiskCachePath(repo);
    fs.mkdirSync(path.dirname(legacy), { recursive: true });
    fs.writeFileSync(legacy, "legacy", "utf8");
    writeDiskCache(repo, "canonical");
    expect(resolveAdrPath(repo)).toBe(diskCachePath(repo));
    expect(readAdrContent(repo)).toBe("canonical");
  } finally {
    cleanupTempRepo(repo);
  }
});
