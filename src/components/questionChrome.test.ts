/**
 * CHROME AROUND A QUESTION IS NOT PART OF THE QUESTION.
 *
 * The reported symptom was `entity_refs: ["Notional Program Meridian Artifact 155"]` — UI
 * position text inside an extracted entity — and the diagnosis on the table called it a cortex
 * send-path leak. IT IS NOT ONE, AND THAT MATTERS FOR WHERE THE GUARD GOES. Cortex has exactly
 * one outgoing message, `value.trim()` in `InputBar`, and the composer is written only by its
 * own textarea; `Artifact {n} of {m}` exists once in the tree, as JSX in `CanvasPane`. There is
 * no path from that span to a request body, which is why reading the send path found nothing.
 *
 * THE JOIN HAPPENS IN THE CLIPBOARD. Copying a question to ask it again is an ordinary thing to
 * do, and a selection over the header takes every label with it: "Q <question> Artifact 155 of
 * 184" reaches extraction as exactly the reported ref once "Q" and "of 184" fall out as
 * non-entities. So the guard belongs on what is SELECTABLE, not on what is sent — a validator
 * on the send path would have to strip words a user may legitimately type.
 *
 * STATED PLAINLY: the clipboard route is INFERRED from a string match, not observed. What is
 * verified is that cortex never composes this text. The check that would settle it is whether
 * the artifact's own `question_text` carries the chrome — if it does, the chrome was in the
 * posted message; if it is clean while `sub_query` is not, the concatenation is server-side and
 * this fix is unrelated to the symptom. It is worth making either way: chrome copied with a
 * question is a defect whether or not it caused this one.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const read = (p: string) => readFileSync(path.join(__dirname, p), "utf8");
const PANE = read("AgenticCanvas/CanvasPane.tsx");
const RAIL = read("NeuralStream/AnswersPanel.tsx");
const INPUT = read("NeuralStream/InputBar.tsx");

describe("the send path composes nothing", () => {
  it("sends the composer's value and nothing joined to it", () => {
    // The fact that refutes the send-path diagnosis. If this ever becomes a template literal,
    // the leak the diagnosis described becomes real and this fails.
    expect(INPUT).toContain("sendMessage(value.trim())");
    expect(INPUT).not.toMatch(/sendMessage\(`/);
  });

  it("the position label lives in exactly one place, and it is a rendered span", () => {
    // If it ever appears twice, one of them is likely not display text.
    const all = [PANE, RAIL, INPUT].join("\n");
    expect(all.match(/Artifact \{currentIndex \+ 1\} of \{artifactCount\}/g)).toHaveLength(1);
  });
});

describe("a selection over a question copies the question alone", () => {
  it("the pane header's Q label and position counter are unselectable", () => {
    const header = PANE.slice(PANE.indexOf("const artifactHeader"), PANE.indexOf("if (components.length === 0)"));
    expect(header).toMatch(/uppercase mr-2 select-none/);
    expect(header).toMatch(/whitespace-nowrap select-none/);
    // Positive control: the question itself must NOT be unselectable, or the fix has taken the
    // thing it was protecting.
    expect(header).toContain("{artifact.question_text || (");
    expect(header).not.toMatch(/select-none[^>]*>\s*\{artifact\.question_text/);
  });

  it("every label sharing the rail's question line is unselectable", () => {
    // The worst row: label, question, separator, timestamp and duration on one line, so a
    // selection over it copied "Q · <question> · 14:32 · 2.1s".
    const row = RAIL.slice(RAIL.indexOf("{captured && a.question_text && ("));
    expect(row).toMatch(/text-slate-600 select-none">Q · <\/span>/);
    expect(row).toMatch(/text-slate-700 select-none"> · <\/span>/);
    expect(row).toMatch(/select-none">\{formatTime\(a\.created_at\)\}/);
    expect(row).toMatch(/select-none"> · \{took\}/);
  });

  it("no `Q · ` label anywhere remains selectable", () => {
    // The rule, not the instances. Both rail rows carry this label and only one was found by
    // reading the first; asserting the absence catches the next one added.
    expect(RAIL).not.toMatch(/className="text-slate-600">Q · <\/span>/);
    expect(RAIL.match(/select-none">Q · <\/span>/g)).toHaveLength(2);
  });

  it("the question text itself is never marked unselectable in the rail", () => {
    // Guards the over-correction: a blanket `select-none` on the row would satisfy every
    // assertion above and make the question uncopyable, which is worse than the defect.
    expect(RAIL).toMatch(/\{highlight\(a\.question_text, ctx\.searchHit\)\}/);
    expect(RAIL).not.toMatch(/line-clamp-1 mt-0\.5 select-none/);
  });
});
