/**
 * THE IN-FLIGHT CARD SHOWED A BARE QUESTION.
 *
 * The ruling is "slot in the strip, not in the question", and the phrase goes byte-equal
 * because of it — correct, and it left a gap: the strip renders from `resolved_intent`, which
 * does not exist until the ANSWER lands. So between the click and the answer, a person who had
 * just picked "Inventory Visibility" saw a question with no trace of having picked anything.
 *
 * `answered_with` is the client's account of what it asked for, and it is NOT `resolved_intent`
 * — that one is the server's account of what it understood. They can disagree, and a bound slot
 * the server refuses is exactly the case worth seeing, so nothing here may merge them.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AnsweredChip } from "./AnsweredChip";
import type { Artifact } from "@/api/types";

afterEach(cleanup);

const art = (answered_with: Artifact["answered_with"]) =>
  ({ id: "a1", question_text: "what is the capability path", answered_with }) as Artifact;

describe("the chip says what was answered", () => {
  it("shows a pick as label AND the id it stands for", () => {
    render(<AnsweredChip artifact={art({ slot: "capability_id", label: "Inventory Visibility", value: "C4" })} />);
    const chip = document.querySelector("[data-answered-chip]")!;
    expect(chip.textContent).toContain("capability:");
    // The `_id` suffix is a fact about a signature, not about a thing.
    expect(chip.textContent).not.toContain("capability_id");
    expect(chip.textContent).toContain("Inventory Visibility");
    expect(chip.textContent).toContain("C4");
  });

  it("shows typed words with NO arrow, because nothing has resolved them", () => {
    // The arrow asserts the words BECAME the value. For a RESPEAK the resolver has not run.
    render(<AnsweredChip artifact={art({ slot: "capability_id", label: "Integration Platform", value: "" })} />);
    const chip = document.querySelector("[data-answered-chip]")!;
    expect(chip.textContent).toContain("Integration Platform");
    expect(chip.textContent).not.toContain("→");
  });

  it("draws nothing on an ordinary turn", () => {
    // Most turns answer no ask. A chip on those would claim a pick nobody made.
    render(<AnsweredChip artifact={art(null)} />);
    expect(document.querySelector("[data-answered-chip]")).toBeNull();
  });

  it("draws nothing on a half-populated pair", () => {
    // A slot with no label has nothing to show a person, and a label with no slot has nothing
    // to attach it to. Either would render as a chip with a blank half.
    render(<AnsweredChip artifact={art({ slot: "capability_id", label: "", value: "C4" })} />);
    expect(document.querySelector("[data-answered-chip]")).toBeNull();
    cleanup();
    render(<AnsweredChip artifact={art({ slot: "", label: "Inventory Visibility", value: "C4" })} />);
    expect(document.querySelector("[data-answered-chip]")).toBeNull();
  });

  it("does not repeat the label when the id IS the label", () => {
    // A pick whose value and label are the same string would otherwise read "Atlas → Atlas".
    render(<AnsweredChip artifact={art({ slot: "program_id", label: "Atlas", value: "Atlas" })} />);
    expect(document.querySelector("[data-answered-chip]")!.textContent).not.toContain("→");
  });
});

describe("the client's account never becomes the server's", () => {
  // COMMENT-STRIPPED. Every one of these files explains the defect by NAMING the field it must
  // not read, so a prose mention reads as a reference. This is the fourth assertion in this
  // repo to be caught by exactly that, and the fix is the same one each time.
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const CHIP = stripComments(readFileSync(path.join(__dirname, "AnsweredChip.tsx"), "utf8"));
  const HOOK = stripComments(
    readFileSync(path.join(__dirname, "../../hooks/useInterviewAgent.ts"), "utf8"),
  );

  it("is actually MOUNTED on the in-flight card", () => {
    // A component nothing renders is the card we started with. This repo has the precedent
    // written down in `InterpretationStrip.test.ts` — the strip was correct and unmounted —
    // and a mutation run found this file missing exactly that assertion.
    //
    // It belongs in the branch with no rendered content, which is the in-flight card: once the
    // answer lands, the strip says this from the SERVER'S account and says it better.
    const CARD = stripComments(readFileSync(path.join(__dirname, "StageCard.tsx"), "utf8"));
    expect(CARD).toContain("<AnsweredChip artifact={artifact} />");
    const inFlight = CARD.slice(CARD.indexOf("{answerSummary(artifact)}") - 700);
    expect(inFlight.slice(0, inFlight.indexOf("{answerSummary(artifact)}"))).toContain(
      "<AnsweredChip artifact={artifact} />",
    );
  });

  it("the chip reads `answered_with` and NOTHING from resolved_intent", () => {
    // Blending them would draw a refusal as an acceptance: the client asked for a slot, the
    // server declined it, and the chip would still say it was used.
    expect(CHIP).toContain("artifact.answered_with");
    expect(CHIP).not.toContain("resolved_intent");
  });

  it("the display label is NOT in the request body", () => {
    // `label` is what a person looked at. The wire carries ids and words — `bound_slots` and
    // `spoken_answer` — and a display string riding along would be a field the server never
    // asked for and cannot validate.
    // ANCHORED ON CODE, NOT ON A COMMENT. The end anchor was `// Stream the response`, which
    // the comment-stripping above deletes — `indexOf` returned -1, the slice ran to the end of
    // the file, and the assertion failed on a line that is nowhere near the request body. A
    // slice whose bounds are not both present is not a slice.
    const start = HOOK.indexOf("const request: InterviewRequest = {");
    const end = HOOK.indexOf("await streamInterviewResponse(");
    expect(start, "request literal not found").toBeGreaterThan(-1);
    expect(end, "send call not found").toBeGreaterThan(start);
    const body = HOOK.slice(start, end);
    expect(body.length, "positive control: the request literal was located").toBeGreaterThan(50);
    expect(body).not.toContain("answeredWith");
    expect(body).not.toContain("answered_with");
    // And it IS written onto the pending artifact, which is the only place it belongs.
    expect(HOOK).toContain("answered_with: answeredWith ?? null");
  });
});

describe("BOTH in-flight surfaces say what was answered", () => {
  // It was mounted on `StageCard` alone. The full pane — which is where a reader lands after
  // picking from an ask — has its own "Working on it…" state with the question header and
  // showed no trace of the pick. One surface tested, two surfaces shipping.
  const stripComments2 = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const PANE = stripComments2(readFileSync(path.join(__dirname, "CanvasPane.tsx"), "utf8"));

  it("the full pane's pending state mounts the chip", () => {
    expect(PANE).toContain("<AnsweredChip artifact={artifact} />");
    // In the EMPTY branch specifically — the one that draws while no components exist.
    const empty = PANE.slice(PANE.indexOf("if (components.length === 0) {"));
    expect(empty.slice(0, empty.indexOf("return (\n    <div className=\"h-full w-full bg-slate-900"))).toContain(
      "<AnsweredChip artifact={artifact} />",
    );
  });

  it("the store PRESERVES the field across an Electric merge", () => {
    // `answered_with` is client-only and the projection has no column for it, so today the key
    // is simply absent from the incoming row and the spread leaves it alone. The day someone
    // adds one — or a mapper emits `answered_with: undefined` — the chip would vanish
    // mid-flight, on the surface a person is watching BECAUSE their answer has not come back.
    // The block already makes this promise for `question_text`; this joins it.
    const STORE = stripComments2(readFileSync(path.join(__dirname, "../../store/useCanvasStore.ts"), "utf8"));
    expect(STORE).toContain("answered_with: existing.answered_with ?? artifact.answered_with ?? null");
  });
});
