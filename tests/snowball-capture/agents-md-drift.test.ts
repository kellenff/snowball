import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "bun:test";

const PROJECT_ROOT = path.resolve(__dirname, "../..");
const AGENTS_MD = path.join(PROJECT_ROOT, "extensions/snowball/.junie/AGENTS.md");
const USING_SNOWBALL = path.join(PROJECT_ROOT, "skills/using-snowball/SKILL.md");

describe("AGENTS.md bootstrap drift", () => {
  it("contains the using-snowball text verbatim", () => {
    const agents = fs.readFileSync(AGENTS_MD, "utf8");
    const source = fs.readFileSync(USING_SNOWBALL, "utf8");

    const begin = "<!-- BEGIN SNOWBALL BOOTSTRAP";
    const end = "<!-- END SNOWBALL BOOTSTRAP";
    const beginIdx = agents.indexOf(begin);
    const endIdx = agents.indexOf(end);
    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBeGreaterThan(beginIdx);

    const between = agents.slice(beginIdx, endIdx);
    expect(between).toContain(source);
  });
});
