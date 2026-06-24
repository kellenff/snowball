const LOCKFILE_PATTERNS = [
  /^package-lock\.json$/,
  /^yarn\.lock$/,
  /^pnpm-lock\.yaml$/,
  /^\.terraform\.lock\.hcl$/,
  /^Cargo\.lock$/,
  /^go\.sum$/,
  /^composer\.lock$/,
];

const PROTECTED_PATH_PATTERNS = [
  /^hooks\//, // don't let apply_patch touch the hook rail
  /^\.vtcode\/hooks\.toml$/,
  /^\.github\//, // don't let apply_patch modify CI
];

const HIGH_RISK_FILE_COUNT = 10;

function extractTouchedPaths(patch: string): string[] {
  const paths = new Set<string>();
  const re = /^diff --git a\/(\S+) b\/(\S+)/gm;
  for (const m of patch.matchAll(re)) {
    paths.add(m[1]);
  }
  return [...paths];
}

export interface BlastRadiusVerdict {
  risk: "low" | "medium" | "high";
  reasons: string[];
}

export function classifyPatchRisk(patch: string): BlastRadiusVerdict {
  const reasons: string[] = [];
  const severe: string[] = [];
  const touched = extractTouchedPaths(patch);

  if (touched.length >= HIGH_RISK_FILE_COUNT) {
    severe.push(
      `touches ${touched.length} files (threshold: ${HIGH_RISK_FILE_COUNT})`,
    );
  }

  for (const p of touched) {
    if (LOCKFILE_PATTERNS.some((re) => re.test(p))) {
      severe.push(`modifies lockfile: ${p}`);
    }
    if (PROTECTED_PATH_PATTERNS.some((re) => re.test(p))) {
      severe.push(`modifies protected path: ${p}`);
    }
  }

  const allReasons = [...severe, ...reasons];
  const risk =
    severe.length > 0 ? "high" : allReasons.length === 0 ? "low" : "medium";
  return { risk, reasons: allReasons };
}

// CLI entry: read JSON from stdin, print verdict as "RISK=...\nREASONS=...\n".
if (
  import.meta.main ||
  (typeof require !== "undefined" && require.main === module)
) {
  let raw = "";
  process.stdin.on("data", (chunk: Buffer | string) => {
    raw += chunk;
  });
  process.stdin.on("end", () => {
    let payload: { tool_input?: unknown } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      process.stdout.write("RISK=low\nREASONS=\n");
      process.exit(0);
      return;
    }
    const input = payload.tool_input ?? payload;
    const patch =
      input &&
      typeof input === "object" &&
      typeof (input as Record<string, unknown>).patch === "string"
        ? ((input as Record<string, unknown>).patch as string)
        : "";
    const verdict = classifyPatchRisk(patch);
    process.stdout.write(
      `RISK=${verdict.risk}\nREASONS=${verdict.reasons.join("|")}\n`,
    );
    process.exit(0);
  });
}
