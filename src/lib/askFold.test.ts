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
    // ⛔ THIS ASSERTED THAT EACH FILE *CONTAINED* THE PROP, AND THAT IS HOW THE CLAIM SHIPPED
    // MISSING. `CanvasPane.tsx` contained it — at line 316, the persona-filtered branch — while
    // line 155, the MAIN answer body a reader actually picks from, had none. The assertion was
    // true about the file and false about the render path, and the gateway found it: a pick
    // arriving with `bound_slots=1` and no `answering_artifact_id`.
    //
    // Two more sites were unthreaded for the same reason: `StageCard`'s preview branch and
    // `PinnedAnswerCard`. Three of five, all live render paths, none visible to a `toContain`.
    //
    // So the assertion is now over EVERY ELEMENT, by AST — a line-based check cannot see a prop
    // on the next line, which is exactly where `StageCard`'s sits.
    const missing = interpretersWithoutArtifactId();
    expect(missing, missing.join("\n")).toEqual([]);
  });

  it("the scan sees a real population, and would notice a stripped prop", () => {
    // Positive control, twice over: it found interpreters at all, and removing a prop is
    // detected. Without the second half a scanner with a broken matcher reports zero forever —
    // which is the same false-green shape as the assertion it replaces.
    const { total } = interpreterCensus();
    expect(total).toBeGreaterThanOrEqual(5);
    expect(interpretersWithoutArtifactId("<SemanticInterpreter payload={{ components }} />")).toEqual(
      ["<probe>"],
    );
  });
});

/**
 * EVERY `<SemanticInterpreter>` MUST BE TOLD WHICH ARTIFACT IT IS RENDERING.
 *
 * An ask card claims lineage to the artifact it is ON, and it gets that id as a prop. An
 * interpreter mounted without one hands `undefined` to `AskCardConnected`, and
 * `answeringArtifactBody()` returns `{}` on a falsy id — so the request is well-formed, the pick
 * arrives, and the claim is silently absent. That is precisely what the gateway observed:
 * `bound_slots=1 spoken_answer=False` with no ask named.
 *
 * BY AST, because the prop can sit on a line of its own and a line-based check cannot see it.
 */
function interpreterElements(): { file: string; line: number; hasId: boolean }[] {
  const ts = require("typescript") as typeof import("typescript");
  const fs = require("node:fs") as typeof import("node:fs");
  const root = path.join(__dirname, "..");
  const out: { file: string; line: number; hasId: boolean }[] = [];
  const walkDir = (dir: string) => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) {
        if (entry === "node_modules" || entry === "__spike__") continue;
        walkDir(full);
      } else if (entry.endsWith(".tsx") && !entry.includes(".test.")) {
        collect(full, fs.readFileSync(full, "utf8"));
      }
    }
  };
  const collect = (file: string, src: string) => {
    const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const visit = (node: import("typescript").Node): void => {
      const opening =
        ts.isJsxSelfClosingElement(node) ? node
        : ts.isJsxOpeningElement(node) ? node
        : null;
      if (opening && opening.tagName.getText(sf) === "SemanticInterpreter") {
        const hasId = opening.attributes.properties.some(
          (a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "artifactId",
        );
        out.push({
          file: path.relative(root, file).split(path.sep).join("/"),
          line: sf.getLineAndCharacterOfPosition(opening.getStart(sf)).line + 1,
          hasId,
        });
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
  };
  walkDir(root);
  return out;
}

function interpreterCensus() {
  const all = interpreterElements();
  return { total: all.length, missing: all.filter((e) => !e.hasId).length };
}

/** Sites with no `artifactId`. Pass `probeSrc` to check a snippet instead of the tree. */
function interpretersWithoutArtifactId(probeSrc?: string): string[] {
  if (probeSrc !== undefined) {
    const ts = require("typescript") as typeof import("typescript");
    const sf = ts.createSourceFile("probe.tsx", `const x = ${probeSrc};`, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let bad = false;
    const visit = (node: import("typescript").Node): void => {
      const el = ts.isJsxSelfClosingElement(node) ? node : ts.isJsxOpeningElement(node) ? node : null;
      if (el && el.tagName.getText(sf) === "SemanticInterpreter") {
        if (!el.attributes.properties.some((a) => ts.isJsxAttribute(a) && a.name.getText(sf) === "artifactId")) bad = true;
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sf, visit);
    return bad ? ["<probe>"] : [];
  }
  return interpreterElements()
    .filter((e) => !e.hasId)
    .map((e) => `${e.file}:${e.line} — <SemanticInterpreter> with no artifactId`);
}
