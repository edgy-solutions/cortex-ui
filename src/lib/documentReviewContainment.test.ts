/**
 * THE CONTAINMENT OF THE PROPOSAL. The document review shape is Cortex's own proposal (no producer
 * declares it), so its names must live where ratification is a one-file edit: the reader
 * (`documentReview.ts`) and the body builder (`buildActBody` in `api/client.ts`). Any other file in
 * `src/` that spells `section_verdicts`, or `"sections"` as a payload key, is a second home.
 * Population: every .ts/.tsx under src/ except tests and the fixture (which is the wire as data).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC = join(__dirname, "..");
const skip = (f: string) => /\.test\.(ts|tsx)$/.test(f) || /documentReviewFixture\.ts$/.test(f);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !skip(name)) out.push(p);
  }
  return out;
}

const PROPOSED_NAMES = /section_verdicts|["']sections["']/;
const ALLOWED = ["api/client.ts", "lib/documentReview.ts"];

describe("the document review proposal is contained", () => {
  it("spells its proposed names only in documentReview.ts and buildActBody", () => {
    const files = walk(SRC);
    expect(files.length, "the walk found the source tree").toBeGreaterThan(100);
    const spelled = files
      .filter((f) => PROPOSED_NAMES.test(readFileSync(f, "utf8")))
      .map((f) => relative(SRC, f).split(sep).join("/"))
      .sort();
    const strays = spelled.filter((f) => !ALLOWED.includes(f));
    expect(strays, `the proposed names are spelled outside the one reader/builder: ${strays.join(", ")}`).toEqual([]);
    expect(spelled, "both homes still spell them (a rename would leave this seal guarding nothing)").toEqual(ALLOWED);
  });
});

/** Source text with line and block comments removed (enough for these two files). */
const stripComments = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const VERB_LITERAL = /(["'`])(promoted|rejected)\1/;

describe("no verb name is spelled in the document review code (config names the case)", () => {
  it("CONTROL: the matcher catches master's DocumentReviewCard snippet, and ignores comments", () => {
    const master = '  const submitDecision = flagged > 0 ? "rejected" : "promoted"; // verb\n  /* block */ const x = 1;';
    expect(VERB_LITERAL.test(stripComments(master))).toBe(true);
    expect(VERB_LITERAL.test(stripComments('// "promoted"\n/* "rejected" */\nconst y = 2;'))).toBe(false);
  });

  it.each(["components/ApprovalTask/DocumentReviewCard.tsx", "lib/documentReview.ts"])("%s spells neither verb as a literal", (rel) => {
    const text = stripComments(readFileSync(join(SRC, rel), "utf8"));
    expect(text.length, "the file was read").toBeGreaterThan(500);
    expect(VERB_LITERAL.exec(text)?.[0] ?? null).toBeNull();
  });
});
