import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "../..");

function readSkill(name: string): string {
  return fs.readFileSync(path.join(ROOT, "skills", name, "SKILL.md"), "utf8");
}

describe("lifecycle skill integrations", () => {
  test("writing-plans mentions design preset before handoff", () => {
    const md = readSkill("writing-plans");
    expect(md).toContain("## Blast-radius before handoff");
    expect(md).toContain("snowball:blast-radius");
    expect(md).toContain("preset `design`");
    expect(md.indexOf("## Blast-radius before handoff")).toBeLessThan(
      md.indexOf("## Execution Handoff"),
    );
  });

  test("executing-plans mentions pre-execution gate per task", () => {
    const md = readSkill("executing-plans");
    expect(md).toContain("preset `pre-execution`");
    expect(md).toContain("snowball:blast-radius");
    expect(md).toContain("Operator confirmation required");
    expect(md).toContain("proposedAction");
  });

  test("finishing-a-development-branch mentions completion preset", () => {
    const md = readSkill("finishing-a-development-branch");
    expect(md).toContain("### Step 1b: Blast-radius completion summary");
    expect(md).toContain("preset `completion`");
    expect(md).toContain("snowball:blast-radius");
    expect(md).toContain("merge-base");
    expect(md.indexOf("### Step 1b: Blast-radius completion summary")).toBeLessThan(
      md.indexOf("### Step 2: Detect Environment"),
    );
  });

  test("blast-radius SKILL documents all three lifecycle callers", () => {
    const md = readSkill("blast-radius");
    expect(md).toContain("writing-plans");
    expect(md).toContain("executing-plans");
    expect(md).toContain("finishing-a-development-branch");
    expect(md).not.toContain("Pre-execution (Plan 2)");
  });
});
