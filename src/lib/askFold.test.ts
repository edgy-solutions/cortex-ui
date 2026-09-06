/**
 * ONE QUESTION, ONE ITEM — and the ways that goes wrong are all worse than two items.
 *
 * Hiding a row is the most destructive thing this rail does, so every rule here is about NOT
 * hiding: fold only an ask, only when a real answer arrived, only on the server's decision.
 * Two rows is a cosmetic complaint. A row that vanishes with nothing standing in its place is
 * an answer the reader cannot get back to.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { foldedAskIds, isAsk } from "./askFold";
import type { Artifact } from "@/api/types";

const art = (over: Partial<Artifact> & { id: string }): Artifact =>
  ({
    status: "complete",
    created_at: 0,
    rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] },
    ...over,
  }) as Artifact;

const ask = (id: string, over: Partial<Artifact> = {}) =>
  art({
    id,
    rendered_output: { components: [{ archetype: "ELICITATION" }] },
    question_text: "what is the capability path",
    ...over,
  });

describe("what counts as an ask", () => {
  it("an artifact carrying an ELICITATION component", () => {
    expect(isAsk(ask("a1"))).toBe(true);
    expect(isAsk(art({ id: "a2" }))).toBe(false);
  });

  it("nothing without components — an in-flight artifact is not an ask", () => {
    expect(isAsk(art({ id: "a3", rendered_output: null }))).toBe(false);
  });
});

describe("an answered ask folds", () => {
  it("folds when a completed answer derives from it", () => {
    const folded = foldedAskIds([ask("q1"), art({ id: "a1", derived_from_artifact_id: "q1" })]);
    expect([...folded]).toEqual(["q1"]);
  });

  it("does NOT fold the answer itself — the row that stands in its place", () => {
    const folded = foldedAskIds([ask("q1"), art({ id: "a1", derived_from_artifact_id: "q1" })]);
    expect(folded.has("a1")).toBe(false);
  });
});

describe("everything that must NOT fold", () => {
  it("an unanswered ask stays — it is the only thing the reader can act on", () => {
    expect(foldedAskIds([ask("q1")]).size).toBe(0);
  });

  it("an ask whose answer is still IN FLIGHT stays", () => {
    // The reader is mid-turn. Dropping the ask now would empty the rail of the only row that
    // says what is happening, and the in-flight card is carrying the chip anyway.
    const folded = foldedAskIds([
      ask("q1"),
      art({ id: "a1", derived_from_artifact_id: "q1", status: "pending" }),
    ]);
    expect(folded.size).toBe(0);
  });

  it("an ordinary follow-up does NOT fold its parent", () => {
    // Lineage between two ANSWERS is a relationship worth having, not a reason to hide one.
    // Both were read; collapsing them deletes a result nobody replaced. The fold is a property
    // of asks — spent once answered — rather than of lineage.
    const folded = foldedAskIds([
      art({ id: "a1" }),
      art({ id: "a2", derived_from_artifact_id: "a1" }),
    ]);
    expect(folded.size).toBe(0);
  });

  it("a second ASK does not fold the first", () => {
    // Two asks in a row is a second question, not an answer to the first.
    const folded = foldedAskIds([ask("q1"), ask("q2", { derived_from_artifact_id: "q1" })]);
    expect(folded.size).toBe(0);
  });

  it("lineage pointing at an artifact that is not here folds nothing", () => {
    // The parent may not have synced yet. Folding on a dangling id would hide nothing and cost
    // nothing today, and hide the wrong row the moment ids collide.
    //
    // AN ASK HAS TO BE IN THE LIST for this to test anything: without one the function returns
    // early on "no asks at all" and the assertion passes over a branch it never reached. A
    // mutation removing the membership check survived exactly that way.
    const folded = foldedAskIds([
      ask("q1"),
      art({ id: "a1", derived_from_artifact_id: "ghost" }),
    ]);
    expect(folded.size).toBe(0);
  });

  it("a failed answer still folds its ask", () => {
    // The turn happened and the ask was spent by it. A failed answer is a row that says so;
    // leaving the ask beside it invites answering a question that has already been asked.
    const folded = foldedAskIds([
      ask("q1"),
      art({ id: "a1", derived_from_artifact_id: "q1", status: "failed" }),
    ]);
    expect([...folded]).toEqual(["q1"]);
  });

  it("nothing folds in a rail with no lineage at all", () => {
    // Positive control: every assertion above is about a set that is usually empty.
    expect(foldedAskIds([art({ id: "a1" }), art({ id: "a2" }), ask("q1")]).size).toBe(0);
  });
});

/**
 * THE WIRING, which three mutations walked straight through.
 *
 * The fold logic was tested and the places that USE it were not, so a rail that stopped
 * folding, a send that dropped the lineage claim, and an ask card handed no artifact id were
 * all green. A pure function nothing calls is the card we started with, one lane over.
 */
describe("the fold and the claim are actually wired", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const read = (rel: string) =>
    stripComments(readFileSync(path.join(__dirname, rel), "utf8"));

  it("the rail filters folded asks out of the list it renders", () => {
    const PANEL = read("../components/NeuralStream/AnswersPanel.tsx");
    expect(PANEL).toContain("foldedAskIds(artifacts)");
    expect(PANEL).toMatch(/!folded\.has\(a\.id\)/);
  });

  it("the send posts the lineage claim from the constant's own function", () => {
    const HOOK = read("../hooks/useInterviewAgent.ts");
    expect(HOOK).toContain("...answeringArtifactBody(answeringArtifactId)");
    // Never a literal: the name is the whole risk, exactly as with `bound_slots`.
    expect(HOOK).not.toMatch(/["']answering_artifact_id["']\s*:/);
  });

  it("the ask card is handed the artifact it is ON, threaded not fetched", () => {
    // Reading "the current artifact" from the store would attach a pick to whichever card the
    // reader happened to have focused — and the server MERGEs on that id, so a wrong parent is
    // not a wrong edge but a CONJURED node.
    const INTERP = read("../components/registry/SemanticInterpreter.tsx");
    expect(INTERP).toContain("<AskCardConnected component={comp} answeringArtifactId={artifactId} />");
    expect(INTERP).not.toMatch(/useCurrentArtifact/);
    // And both surfaces that render an artifact's components pass its id down.
    expect(read("../components/AgenticCanvas/StageCard.tsx")).toContain("artifactId={artifact.id}");
    expect(read("../components/AgenticCanvas/CanvasPane.tsx")).toContain("artifactId={artifact.id}");
  });
});
