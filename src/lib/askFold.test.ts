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
import { askParentOf, foldedAskAnswers, foldedAskIds, isAsk, lineageParentIds } from "./askFold";
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

/**
 * THE CANVAS, WHICH THE RAIL'S FOLD DID NOT COVER.
 *
 * `foldedAskIds` was wired into `AnswersPanel` alone. The canvas builds its own list — computed
 * from `artifacts` in GLOBAL, from placed `items` on a custom board — and folded neither, so
 * both cards stayed and the ask kept drawing where the answer belonged.
 *
 * THE TWO SURFACES NEED DIFFERENT OPERATIONS, which is why one set does not serve both:
 *
 *   GLOBAL is computed. A superseded ask is DROPPED and the layout closes up. Nothing was
 *   arranged, so nothing is lost.
 *
 *   A CUSTOM BOARD has arrangement. A card sits where a person put it, at a size they may have
 *   chosen, so dropping it leaves a HOLE in a board they made. The slot draws the ANSWER
 *   instead — same position, same footprint, the question become its result.
 */
describe("an answered ask is superseded on the canvas too", () => {
  it("pairs each folded ask with the answer that replaced it", () => {
    const m = foldedAskAnswers([ask("q1"), art({ id: "a1", derived_from_artifact_id: "q1" })]);
    expect(m.get("q1")).toBe("a1");
    expect(m.size).toBe(1);
  });

  it("pairs NOTHING in every case the rail refuses to fold", () => {
    // The pairing must not be more permissive than the set — a canvas slot swapped on lineage
    // the rail would not fold is a card silently replaced by the wrong answer.
    expect(foldedAskAnswers([ask("q1")]).size).toBe(0);
    expect(
      foldedAskAnswers([ask("q1"), art({ id: "a1", derived_from_artifact_id: "q1", status: "pending" })]).size,
    ).toBe(0);
    expect(foldedAskAnswers([art({ id: "a1" }), art({ id: "a2", derived_from_artifact_id: "a1" })]).size).toBe(0);
    expect(foldedAskAnswers([ask("q1"), ask("q2", { derived_from_artifact_id: "q1" })]).size).toBe(0);
    expect(foldedAskAnswers([ask("q1"), art({ id: "a1", derived_from_artifact_id: "ghost" })]).size).toBe(0);
  });

  it("the FIRST answer wins when an ask somehow has two", () => {
    // Otherwise the slot flips between two answers depending on array order, which reads as a
    // card changing its mind.
    const m = foldedAskAnswers([
      ask("q1"),
      art({ id: "a1", derived_from_artifact_id: "q1" }),
      art({ id: "a2", derived_from_artifact_id: "q1" }),
    ]);
    expect(m.get("q1")).toBe("a1");
  });

  it("agrees with the rail exactly — one rule, two consumers", () => {
    // If these ever disagree, a row vanishes from the list while its card stays on the board,
    // or the reverse. Same population, asserted against each other rather than restated.
    const population = [
      ask("q1"),
      art({ id: "a1", derived_from_artifact_id: "q1" }),
      ask("q2"),
      art({ id: "a2", derived_from_artifact_id: "q2", status: "pending" }),
      art({ id: "a3" }),
    ];
    expect([...foldedAskAnswers(population).keys()].sort()).toEqual([...foldedAskIds(population)].sort());
  });

  it("the canvas applies it — GLOBAL drops, a placed slot SWAPS", () => {
    // The wiring, because a pairing nothing calls is the two cards we started with.
    const STAGE = stripCommentsOf("../components/AgenticCanvas/GlobalCanvasStage.tsx");
    expect(STAGE).toContain("foldedAskAnswers(artifacts)");
    // GLOBAL: removed from the computed list.
    expect(STAGE).toMatch(/\.filter\(\(a\) => !folded\.has\(a\.id\)\)/);
    // CUSTOM: the slot keeps its position and draws the answer.
    expect(STAGE).toMatch(/const answerId = folded\.get\(it\.id\);/);
    expect(STAGE).toMatch(/answerId \? artifactById\[answerId\] : artifactById\[it\.id\]/);
    // AND THE SLOT'S GEOMETRY IS THE SLOT'S — `it.x`, `it.y`, `cardSize(it)`. This is the whole
    // point of replacing rather than removing: the answer appears WHERE THE QUESTION WAS, at the
    // size the person gave it. A mutation zeroing the position survived until this line, because
    // every other assertion was about WHICH artifact draws and none about where.
    expect(STAGE).toMatch(/pos: \{ x: it\.x, y: it\.y \}, itemId: it\.id, size: cardSize\(it\)/);
  });

  it("and does NOT rewrite the stored board", () => {
    // Substituted at render. Persisting the swap would edit a board on its owner's behalf, and
    // an arranged board is theirs — the same rule that makes `arranged` load-bearing.
    const STAGE = stripCommentsOf("../components/AgenticCanvas/GlobalCanvasStage.tsx");
    expect(STAGE).not.toMatch(/moveItem\([^)]*answerId|setCanvases[^)]*folded/);
  });
});

function stripCommentsOf(rel: string): string {
  return readFileSync(path.join(__dirname, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/**
 * THE CAMERA, WHICH IS WHERE THE FOLD IS FELT.
 *
 * Three defects reported from one walk, all on the stage rather than in the fold rule:
 *
 *  1. A GAP where the ask used to be. The layout was computed from ALL artifacts and the fold
 *     filtered `entries` afterwards, so a slot was allocated to a card that was never drawn.
 *     The board looked like something had been DELETED rather than answered.
 *  2. THE WHOLE CANVAS ZOOMED OUT when the answer arrived. `posOf(focusId)` returning null fell
 *     through to the world fit — the most disruptive fallback available, reached whenever the
 *     focused card is briefly or permanently absent from the layout. The fold makes that
 *     reachable a new way: read an ask, its answer arrives, the ask leaves the board.
 *  3. A NEW QUESTION DID NOT TAKE FOCUS. `internalSelect` was set on every card click including
 *     one that did not change the current artifact, and the effect that clears it only runs when
 *     the id CHANGES — so a stale `true` survived and swallowed the next real focus.
 */
describe("the stage follows the fold instead of being stranded by it", () => {
  const STAGE = () => stripCommentsOf("../components/AgenticCanvas/GlobalCanvasStage.tsx");

  it("lays out only the cards it draws, so no gap is left behind", () => {
    // The layout and the render must read the SAME list. Computing from `artifacts` and
    // rendering from a filtered copy is what left the hole.
    const s = STAGE();
    expect(s).toMatch(/const visibleArtifacts = useMemo\(\s*\(\) => artifacts\.filter\(\(a\) => !folded\.has\(a\.id\)\)/);
    expect(s).toMatch(/computeStageLayout\(visibleArtifacts, sortMode, edges\)/);
    // Edges too — an edge to a card that is not drawn is a line into empty space.
    expect(s).toMatch(/computeStageEdges\(visibleArtifacts\)/);
    expect(s).not.toMatch(/computeStageLayout\(artifacts,/);
  });

  it("a focused card with no position HOLDS the camera — it does not fit the world", () => {
    // The zoom-out. This is the assertion that would have caught it: the fallback existed and
    // was reached, and nothing said it must not be the world.
    expect(STAGE()).toMatch(/if \(focusId && !fp\) return camRef\.current;/);
  });

  it("focus follows a folded card to its successor", () => {
    // What makes the swap a MOVE rather than a disappearance: you were reading the question,
    // and you end up on the answer that replaced it.
    const s = STAGE();
    expect(s).toMatch(/const successor = folded\.get\(focusId\);/);
    expect(s).toMatch(/focus\(successor\)/);
  });

  it("and follows ONLY the fold — not every card that leaves the board", () => {
    // "The thing you were reading was replaced by THIS" is a claim the lineage makes. Nothing
    // else on this surface can make it, so nothing else may move a reader's camera.
    const s = STAGE();
    const effect = s.slice(s.indexOf("const successor = folded.get(focusId);"));
    expect(effect.slice(0, effect.indexOf("}, ["))).not.toMatch(/clearFocus|setView/);
  });

  it("a click on the ALREADY-CURRENT card leaves no stale in-place flag", () => {
    // The stale `true` swallowed the focus of the NEXT new artifact — the reader's own
    // question appeared on the canvas while the camera stayed on what they had been reading.
    expect(STAGE()).toMatch(/internalSelect\.current = id !== currentArtifactId;/);
    expect(STAGE()).not.toMatch(/internalSelect\.current = true;/);
  });
});

/**
 * THE EDGE IS BECOMING MULTI-VALUED, AND A STRING READER WOULD REVERT THE FOLD SILENTLY.
 *
 * ADR-0050 §6.2 requires `derived_from` per PANEL — N edges, not one — and the engine lane has
 * taken that change. Today the field is `Optional[str]` and every reader here treated it as one
 * string. The day it lands as an array, `asks.has(["q1"])` is false and `find(a => a.id ===
 * ["q1"])` misses: the fold stops folding, the collapsed offer disappears, the "asked first"
 * line stops drawing. NOTHING THROWS. A feature reverts and the suite stays green, because every
 * fixture in this file passes a scalar.
 *
 * So both shapes are read now, through one function, and asserted for both. This costs nothing
 * while the producer is scalar and means the two lanes do not have to land in the same hour.
 */
describe("lineage is read for the shape it has AND the shape it is getting", () => {
  const withParents = (id: string, parents: unknown): Artifact =>
    ({ ...art({ id }), derived_from_artifact_id: parents }) as unknown as Artifact;

  it("reads a scalar — today's shape", () => {
    expect(lineageParentIds(withParents("a1", "q1"))).toEqual(["q1"]);
  });

  it("reads an ARRAY — the shape that has not landed", () => {
    expect(lineageParentIds(withParents("a1", ["q1", "p2", "p3"]))).toEqual(["q1", "p2", "p3"]);
  });

  it("keeps the producer's ORDER, because §6.2's edges are per panel", () => {
    // The projection is forbidden from reordering, so the first is the first they wrote — not
    // an arbitrary pick that happens to be stable.
    expect(lineageParentIds(withParents("a1", ["p3", "p1", "p2"]))).toEqual(["p3", "p1", "p2"]);
  });

  it("treats absent, empty and junk as no lineage rather than as a parent", () => {
    expect(lineageParentIds(withParents("a1", null))).toEqual([]);
    expect(lineageParentIds(withParents("a1", undefined))).toEqual([]);
    expect(lineageParentIds(withParents("a1", "   "))).toEqual([]);
    expect(lineageParentIds(withParents("a1", []))).toEqual([]);
    expect(lineageParentIds(withParents("a1", [null, 7, ""]))).toEqual([]);
    expect(lineageParentIds(null)).toEqual([]);
  });

  it("FOLDS on an array parent — the regression this prevents", () => {
    // The whole point. With a string reader this returns an empty set and two cards come back.
    const folded = foldedAskIds([
      ask("q1"),
      { ...art({ id: "a1" }), derived_from_artifact_id: ["q1"] } as unknown as Artifact,
    ]);
    expect([...folded]).toEqual(["q1"]);
  });

  it("finds the ask among SEVERAL parents, where 'the parent' stops meaning anything", () => {
    // A canvas artifact carries one edge per panel. Only one of them can be the question that
    // was answered, so reading [0] is a coin flip on edge order rather than a rule.
    const answerArt = {
      ...art({ id: "a1" }),
      derived_from_artifact_id: ["panel-1", "q1", "panel-2"],
    } as unknown as Artifact;
    const all = [art({ id: "panel-1" }), ask("q1"), art({ id: "panel-2" }), answerArt];
    expect(askParentOf(answerArt, all)?.id).toBe("q1");
    expect([...foldedAskIds(all)]).toEqual(["q1"]);
  });

  it("pairs the answer to the ask among several parents too", () => {
    const answerArt = {
      ...art({ id: "a1" }),
      derived_from_artifact_id: ["panel-1", "q1"],
    } as unknown as Artifact;
    expect(foldedAskAnswers([ask("q1"), art({ id: "panel-1" }), answerArt]).get("q1")).toBe("a1");
  });

  it("still folds NOTHING when none of the several parents is an ask", () => {
    // The permissiveness must not grow with the arity: many parents is not a reason to fold one.
    const answerArt = {
      ...art({ id: "a1" }),
      derived_from_artifact_id: ["p1", "p2"],
    } as unknown as Artifact;
    expect(foldedAskIds([art({ id: "p1" }), art({ id: "p2" }), answerArt]).size).toBe(0);
    expect(askParentOf(answerArt, [art({ id: "p1" }), art({ id: "p2" })])).toBeNull();
  });

  it("no consumer reads the field directly any more", async () => {
    // The regression would arrive through whichever reader was left behind, so the rule is that
    // there are none. `askedPick` and the two surfaces go through `askParentOf`.
    const { readFileSync } = await import("node:fs");
    const p = await import("node:path");
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const rel of [
      "../components/elicitation/AskedSection.tsx",
      "../components/HUD/DecisionPathDiagram.tsx",
    ]) {
      const src = strip(readFileSync(p.join(__dirname, rel), "utf8"));
      expect(src, rel).toContain("askParentOf(artifact");
      expect(src, rel).not.toContain("derived_from_artifact_id");
    }
  });
});
