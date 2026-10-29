import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// VITE_NO_AUTH has exactly three legitimate readers. Key on the SUBJECT: the env name, or the stand-in
// owner literals a shim would invent ("no-auth", "no-auth@localhost").
const SRC = resolve(__dirname, "..");
const ALLOWED = ["auth/RequireAuth.tsx", "components/UserMenu.tsx", "config.ts"].sort();
const SUBJECT = [/NO_AUTH/, /["'`]no-auth(@localhost)?["'`]/];

function walk(dir: string, out: string[]): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    const rel = relative(SRC, p).split(sep).join("/");
    if (e.isDirectory()) {
      if (rel === "api/generated") continue;
      walk(p, out);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

let files: string[] = [];
let matches: string[] = [];
beforeAll(() => {
  files = walk(SRC, []);
  matches = files.filter((f) => SUBJECT.some((re) => re.test(readFileSync(join(SRC, f), "utf8")))).sort();
});

describe("VITE_NO_AUTH is read only where master reads it", () => {
  it("the files that read no-auth are exactly config, RequireAuth and UserMenu", () => {
    expect(
      matches,
      "VITE_NO_AUTH is read only by config, RequireAuth and UserMenu; a no-auth shim anywhere else gives a dev build a fake identity (ruling 2026-10-29)",
    ).toEqual(ALLOWED);
  });

  it("the population is not empty: the walk saw the tree and found config.ts", () => {
    expect(files.length).toBeGreaterThanOrEqual(200);
    expect(matches).toContain("config.ts");
  });
});
