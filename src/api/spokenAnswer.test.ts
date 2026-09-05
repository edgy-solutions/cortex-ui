/**
 * THE SECOND JOIN, SEALED FROM THIS SIDE — the RESPEAK answer's two fields.
 *
 * Same guard as `boundSlots.test.ts` and the same reason: the failure is SILENT. `gateway.py`
 * declares `spoken_slot` / `spoken_answer` and reads `request.spoken_slot` /
 * `request.spoken_answer`. A body posting any other name is not rejected — the model parses
 * the field it wants as None, the supervisor sees no answer, and the turn proceeds AS IF THE
 * READER HAD NOT ANSWERED, with no 422 and no log line.
 *
 * WHAT THIS FILE CANNOT DO, unchanged: a vitest process cannot POST to a gateway and read what
 * pydantic parsed. So the far half belongs to a backend test, and what runs here reads THE
 * GATEWAY'S OWN DECLARATION and asserts cortex's constants against it — strictly stronger than
 * asserting cortex against cortex.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { SPOKEN_ANSWER_FIELD, SPOKEN_SLOT_FIELD, spokenAnswerBody } from "./spokenAnswer";
import { BOUND_SLOTS_FIELD } from "./boundSlots";

/** The producer's gateway, when this machine has it checked out beside cortex. */
const GATEWAY = path.join(__dirname, "../../../invincible-agent/src/iagent/gateway.py");
const HAVE_GATEWAY = existsSync(GATEWAY);

describe("the field names", () => {
  it("are the ones the gateway model declares", () => {
    // The floor, which always runs — a machine without the sibling checkout still asserts
    // something rather than nothing.
    expect(SPOKEN_SLOT_FIELD).toBe("spoken_slot");
    expect(SPOKEN_ANSWER_FIELD).toBe("spoken_answer");
  });

  it("are NOT the pick's name, which is the whole point of there being two paths", () => {
    // A RESPEAK ask had no menu by construction, so `validate_bound_slots` refuses its slot as
    // `no_menu` BY DESIGN. Posting these words under `bound_slots` would 422 or take the
    // silent default; the separate name is what says "these are words, not a pick".
    expect(SPOKEN_SLOT_FIELD).not.toBe(BOUND_SLOTS_FIELD);
    expect(SPOKEN_ANSWER_FIELD).not.toBe(BOUND_SLOTS_FIELD);
  });

  /**
   * The declaration lines, read once. Built with `String.raw` and a per-field literal rather
   * than by concatenating escapes into a string: a `\b` written through a shell heredoc has
   * already become a literal BACKSPACE byte once in this codebase, and the regex then matched
   * nothing while the test stayed green. A pattern that cannot silently degrade is worth the
   * two lines.
   */
  const DECLARED = {
    [SPOKEN_SLOT_FIELD]: /^\s*spoken_slot:\s*str\s*\|\s*None\s*=\s*None\s*$/m,
    [SPOKEN_ANSWER_FIELD]: /^\s*spoken_answer:\s*str\s*\|\s*None\s*=\s*None\s*$/m,
  };
  const READ = {
    [SPOKEN_SLOT_FIELD]: /request\.spoken_slot\b/,
    [SPOKEN_ANSWER_FIELD]: /request\.spoken_answer\b/,
  };
  const AS_DICT = {
    [SPOKEN_SLOT_FIELD]: /^\s*spoken_slot:\s*dict\[/m,
    [SPOKEN_ANSWER_FIELD]: /^\s*spoken_answer:\s*dict\[/m,
  };

  it("those patterns name the fields the constants name", () => {
    // Guards the guard. If a constant is renamed and these literals are not, every live-read
    // assertion below would go on testing the OLD name and passing — the same silent shape
    // they exist to catch, one level up.
    for (const field of [SPOKEN_SLOT_FIELD, SPOKEN_ANSWER_FIELD]) {
      expect(DECLARED[field].source).toContain(field);
      expect(READ[field].source).toContain(field);
      expect(AS_DICT[field].source).toContain(field);
    }
  });

  it.skipIf(!HAVE_GATEWAY)("match the DECLARATIONS in gateway.py, read live", () => {
    // Not a copy of the names — the names as the server declares them. If the model is renamed
    // and cortex is not, this fails on the next run rather than on a demo.
    const src = readFileSync(GATEWAY, "utf8");
    for (const field of [SPOKEN_SLOT_FIELD, SPOKEN_ANSWER_FIELD]) {
      expect(
        src,
        `no \`${field}: str | None = None\` declaration found in gateway.py`,
      ).toMatch(DECLARED[field]);
    }
  });

  it.skipIf(!HAVE_GATEWAY)("are names the gateway READS, not merely ones it declares", () => {
    // A declared-but-unread field is the advertised-unconsumed shape, and here it would be
    // indistinguishable from success: the answer would post, parse, and be ignored.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(READ[SPOKEN_SLOT_FIELD]);
    expect(src).toMatch(READ[SPOKEN_ANSWER_FIELD]);
  });

  it.skipIf(!HAVE_GATEWAY)("are SCALARS there, not a dict wearing a different name", () => {
    // Two scalars because a RESPEAK ask asks about exactly one slot and there is exactly one
    // answer. If the far side ever widens them to a dict, `spokenAnswerBody` is posting the
    // wrong shape and this says so before a reader's answer disappears.
    const src = readFileSync(GATEWAY, "utf8");
    for (const field of [SPOKEN_SLOT_FIELD, SPOKEN_ANSWER_FIELD]) {
      expect(src).not.toMatch(AS_DICT[field]);
    }
  });
});

describe("the outgoing body is built from the constants, never typed literals", () => {
  it("puts the answer under the keys the gateway reads", () => {
    expect(spokenAnswerBody({ slot: "program_id", answer: "meridian" })).toEqual({
      spoken_slot: "program_id",
      spoken_answer: "meridian",
    });
    expect(Object.keys(spokenAnswerBody({ slot: "a", answer: "b" })).sort()).toEqual(
      [SPOKEN_ANSWER_FIELD, SPOKEN_SLOT_FIELD].sort(),
    );
  });

  it("omits both fields entirely on an ordinary turn — ABSENT, not empty", () => {
    // The gateway declares `str | None`, so an omitted field parses as None while `""` parses
    // as an empty string. "Nobody answered" and "answered with nothing" stay distinguishable
    // at the model, and only the first is true of a turn that answered no ask.
    expect(spokenAnswerBody(undefined)).toEqual({});
    expect(SPOKEN_SLOT_FIELD in spokenAnswerBody(undefined)).toBe(false);
    expect(SPOKEN_ANSWER_FIELD in spokenAnswerBody(undefined)).toBe(false);
  });

  it("never posts HALF a pair, in either direction", () => {
    // An answer with no slot has nowhere to land, and a slot with no answer is a claim that
    // someone replied with nothing. Both halves are written together or neither is.
    expect(spokenAnswerBody({ slot: "", answer: "meridian" })).toEqual({});
    expect(spokenAnswerBody({ slot: "program_id", answer: "" })).toEqual({});
    expect(spokenAnswerBody({ slot: "program_id", answer: "   " })).toEqual({});
  });

  it("the send path uses that function rather than assembling the keys itself", () => {
    // A source-level guard, matching how `boundSlotsBody` is pinned. Literals at the call site
    // would be correct TODAY and silent the day the server renames a field.
    const hook = readFileSync(path.join(__dirname, "../hooks/useInterviewAgent.ts"), "utf8");
    expect(hook).toMatch(/\.\.\.spokenAnswerBody\(spoken\)/);
    expect(hook).not.toMatch(/["']spoken_slot["']\s*:/);
    expect(hook).not.toMatch(/["']spoken_answer["']\s*:/);
    // Positive control: if the assertions above stopped matching the file at all, this proves
    // we still read the file we think we read.
    expect(hook).toMatch(/mutationFn/);
  });

  it("the request type declares both, so a body cannot carry one alone by mistake", () => {
    const types = readFileSync(path.join(__dirname, "./types.ts"), "utf8");
    expect(types).toContain("spoken_slot?: string;");
    expect(types).toContain("spoken_answer?: string;");
  });
});

describe("nothing is composed into the phrase any more", () => {
  it("the contract's resolver builds no question-shaped string", () => {
    // THE DEFECT THIS CLOSED, pinned at the source. `"<sub_query> (<slot>: <answer>)"` was
    // assembled here, travelled on the wire, and was rendered to a person as their own
    // question. A template literal joining the phrase to the slot is the exact shape, so the
    // file is guarded against growing one back.
    const contract = readFileSync(
      path.join(__dirname, "../components/elicitation/Elicitation.contract.ts"),
      "utf8",
    );
    const body = contract.slice(contract.indexOf("export function resolveAsk"));
    expect(body).not.toMatch(/\$\{ask\.sub_query\}/);
    expect(body).not.toMatch(/\$\{ask\.slot\}/);
    // Positive control: the resolver is still here and still returns the phrase.
    expect(body).toMatch(/query:\s*ask\.sub_query/);
  });
});
