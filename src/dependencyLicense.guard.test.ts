import { describe, expect, it } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

/**
 * Copyleft dependencies cannot enter this repo, and one banned package is DISGUISED AS A
 * NAME.
 *
 * WHY THIS FILE EXISTS. The Phase-1 timeline spike evaluates three gantt/timeline libraries.
 * Ruled 2026-08-22, with evidence, by the operator:
 *
 *   vis-timeline              Apache-2.0 OR MIT   OK   (the plan's fallback)
 *   frappe-gantt              MIT                 OK   (GPL association is guilt-by-adjacency:
 *                                                       ERPNext is GPL-3.0, the library is not)
 *   @svar-ui/react-gantt      MIT                 OK   (open-source core; PRO is commercial)
 *   wx-react-gantt            GPL-3.0             BANNED
 *
 * The last two are THE SAME PROJECT. SVAR rewrote it and renamed the package; the OLD name is
 * GPLv3 and would contaminate this MIT repo, the NEW name is MIT. So the difference between
 * safe and unsafe is a package name, and nothing about "svar" in a diff tells you which one
 * you are looking at.
 *
 * That is precisely the shape a future dependency bump "simplifies" back into — someone sees
 * two svar-ish packages, picks the shorter name, and the license changes with no visible
 * signal. A comment next to the dependency would not survive that; a failing build does.
 *
 * CHECKS THE LOCKFILE, NOT JUST package.json. A banned package is at least as likely to
 * arrive transitively as to be typed by hand, and a direct-dependency-only check would report
 * clean while the tree contains it.
 */

const REPO = path.resolve(__dirname, "..");

/** package name -> why it is banned. */
const BANNED: Record<string, string> = {
  "wx-react-gantt":
    "GPL-3.0. The SVAR gantt under its OLD package name. The rewritten, MIT-licensed " +
    "package is `@svar-ui/react-gantt` — use that one. Same project, different licence.",
};

/**
 * Licences that may enter this repo. Not enforced across the whole tree here (that needs
 * node_modules and a licence scanner); this list is the RULING, written down where the test
 * that enforces the banned-name half can point at it.
 */
const ALLOWED_LICENCES = ["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause"];

function readJson(rel: string): Record<string, unknown> | null {
  const p = path.join(REPO, rel);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, "utf8"));
}

describe("dependency licence guard", () => {
  it("reads package.json — positive control", () => {
    // A guard whose input silently went missing passes forever. This repo keeps biting on
    // exactly that shape, so the input is asserted before anything is concluded from it.
    const pkg = readJson("package.json");
    expect(pkg, "package.json not readable from the guard's REPO path").not.toBeNull();
    const deps = {
      ...((pkg!.dependencies as Record<string, string>) ?? {}),
      ...((pkg!.devDependencies as Record<string, string>) ?? {}),
    };
    expect(Object.keys(deps).length).toBeGreaterThan(5);
  });

  it("declares at least one banned package — the guard is not vacuous", () => {
    expect(Object.keys(BANNED).length).toBeGreaterThan(0);
    expect(ALLOWED_LICENCES).toContain("MIT");
  });

  it("no banned package is a direct dependency", () => {
    const pkg = readJson("package.json")!;
    const deps = {
      ...((pkg.dependencies as Record<string, string>) ?? {}),
      ...((pkg.devDependencies as Record<string, string>) ?? {}),
    };
    const found = Object.keys(BANNED).filter((name) => name in deps);
    expect(
      found,
      found.map((n) => `${n}: ${BANNED[n]}`).join("\n"),
    ).toEqual([]);
  });

  it("no banned package appears anywhere in the lockfile", () => {
    const lock = readJson("package-lock.json");
    if (lock === null) {
      // Not a silent skip: say so, so a missing lockfile cannot read as a clean result.
      throw new Error(
        "package-lock.json is missing — the transitive half of this guard cannot run. " +
          "Restore the lockfile rather than deleting this assertion.",
      );
    }
    const packages = Object.keys((lock.packages as Record<string, unknown>) ?? {});
    expect(packages.length, "lockfile parsed but contains no packages").toBeGreaterThan(10);

    const hits: string[] = [];
    for (const banned of Object.keys(BANNED)) {
      // Lockfile keys look like "node_modules/foo" and "node_modules/a/node_modules/foo".
      const match = packages.filter(
        (p) => p === `node_modules/${banned}` || p.endsWith(`/node_modules/${banned}`),
      );
      if (match.length > 0) hits.push(`${banned} (as ${match[0]}): ${BANNED[banned]}`);
    }
    expect(hits, hits.join("\n")).toEqual([]);
  });
});
