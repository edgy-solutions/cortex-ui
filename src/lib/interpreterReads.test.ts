/**
 * INTERPRETER_READS — the excuse from the raw section is keyed on SemanticInterpreter's SOURCE
 * TEXT, so a name the interpreter stops reading is a red rather than a silent hole.
 */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { INTERPRETER_READS } from "./rawFields";

const SRC = readFileSync(path.join(__dirname, "../components/registry/SemanticInterpreter.tsx"), "utf8");

/** The text of one archetype's `case` block: from `case "X"` to the next top-level case/default. */
function caseBlock(archetype: string): string {
  const start = SRC.indexOf(`case "${archetype}"`);
  if (start < 0) return "";
  const rest = SRC.slice(start + 1);
  const m = /\n    (case "|default:)/.exec(rest);
  return SRC.slice(start, m ? start + 1 + m.index : undefined);
}

const reads = (text: string, name: string) => new RegExp(`\\bcomp\\??\\.${name}\\b`).test(text);

describe("INTERPRETER_READS — every excused name is really read by the interpreter", () => {
  for (const [scope, names] of Object.entries(INTERPRETER_READS)) {
    for (const name of names) {
      const where = scope === "*" ? "in SemanticInterpreter.tsx" : `inside case "${scope}"`;
      it(`${name} is read as comp.${name} ${where}`, () => {
        const text = scope === "*" ? SRC : caseBlock(scope);
        expect(text.length, `no case block found for ${scope}`).toBeGreaterThan(0);
        expect(
          reads(text, name),
          `${name} is excused from raw but the interpreter does not read comp.${name}`,
        ).toBe(true);
      });
    }
  }

  it("the predicate can fail: a never-read name, and a name read only in another case", () => {
    expect(reads(SRC, "zz_never_read_by_anything")).toBe(false);
    expect(reads(caseBlock("CONTRIBUTION_RANKING"), "source_persona")).toBe(false);
  });
});
