/**
 * CONFIG NAMES THE CASE: PromotionReviewCard takes its verb roles from the served declaration
 * (`reason_required`), never from a verb's name. Same approach as `src/lib/documentReviewContainment.test.ts` (#56).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Source text with line, block and JSX comments removed (the JSX form is a block comment in braces).
const stripComments = (t: string) =>
  t
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");
const VERB_LITERAL = /(["'`])(promoted|rejected)\1/;

describe("no verb name is spelled in PromotionReviewCard", () => {
  it("CONTROL: the matcher catches master's line, and ignores comments (line, block, JSX)", () => {
    const master = '  const promoteVerb = verbs.includes("promoted") ? "promoted" : null;';
    expect(VERB_LITERAL.test(stripComments(master))).toBe(true);
    const commented = '// "promoted"\n/* "rejected" */\n{/* the control gates on stage === "promoted" */}\nconst y = 2;';
    expect(VERB_LITERAL.test(stripComments(commented))).toBe(false);
  });

  it("the card spells neither verb as a literal", () => {
    const text = stripComments(readFileSync(join(__dirname, "PromotionReviewCard.tsx"), "utf8"));
    expect(text.length, "the file was read").toBeGreaterThan(5000);
    expect(VERB_LITERAL.exec(text)?.[0] ?? null).toBeNull();
  });
});
