/**
 * ONE RULE FOR "WHAT WAS ASKED AND WHAT WAS PICKED", BECAUSE TWO SURFACES SHOW IT.
 *
 * Seen on screen: the decision path rendered "asked first — what is the capability path" with
 * NOTHING beside it, while the answer card below it showed both the question and the pick. Two
 * readings of one fact, and the difference only appeared on a reloaded session — because the
 * decision path took the pick from `answered_with`, which is what THIS BROWSER sent and does
 * not survive a reload or an artifact arriving through Electric.
 *
 * The producer's `accepted_slots` is what actually reached the verb, so it decides the VALUE.
 * The menu supplies the LABEL, because the server carries `C8` and the reader clicked
 * "Analytics & Reporting".
 */
import { describe, it, expect } from "vitest";
import { parseSourceOrThrow } from "@/lib/parseSource";
import { readAskOf, readPick } from "./askedPick";
import type { Artifact } from "@/api/types";

const OPTIONS = [
  { value: "C1", label: "Data Governance" },
  { value: "C8", label: "Analytics & Reporting" },
];

const parent = (over: Record<string, unknown> = {}): Artifact =>
  ({
    id: "q1",
    question_text: "what is the capability path",
    rendered_output: {
      components: [
        { archetype: "ELICITATION", disposition: "ask", slot: "capability_id", options: OPTIONS, ...over },
      ],
    },
  }) as unknown as Artifact;

const answer = (over: Partial<Artifact> = {}): Artifact =>
  ({ id: "a1", derived_from_artifact_id: "q1", ...over }) as unknown as Artifact;

describe("finding the ask", () => {
  it("reads it out of the parent's components", () => {
    expect(readAskOf(parent())?.slot).toBe("capability_id");
  });

  it("finds it among siblings rather than assuming it is first", () => {
    const p = parent();
    (p.rendered_output!.components as unknown[]).unshift({ archetype: "PERIOD_SERIES", rows: [] });
    expect(readAskOf(p)?.options).toHaveLength(2);
  });

  it("returns nothing for an artifact that carries no ask", () => {
    expect(readAskOf({ rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] } } as unknown as Artifact)).toBeNull();
    expect(readAskOf(null)).toBeNull();
    expect(readAskOf({ rendered_output: null } as unknown as Artifact)).toBeNull();
  });
});

describe("the pick survives a reload — this is the defect that was visible", () => {
  const ask = () => readAskOf(parent())!;

  it("reads the value from the SERVER when the client's record is gone", () => {
    // Exactly the screenshot: an Electric-synced answer with no `answered_with`. The decision
    // path showed the question and nothing else.
    const pick = readPick(
      answer({ resolved_intent: { accepted_slots: { capability_id: "C8" } } } as Partial<Artifact>),
      ask(),
    );
    expect(pick).toEqual({ slot: "capability_id", label: "Analytics & Reporting", value: "C8" });
  });

  it("takes the LABEL from the menu, not from the id", () => {
    // The server carries `C8`; the reader clicked "Analytics & Reporting". Showing the id alone
    // is technically true and answers a question nobody asked.
    const pick = readPick(
      answer({ resolved_intent: { accepted_slots: { capability_id: "C1" } } } as Partial<Artifact>),
      ask(),
    );
    expect(pick!.label).toBe("Data Governance");
  });

  it("prefers the SERVER's value over the client's when both exist", () => {
    // They can disagree — a bound slot the server refuses is the case worth seeing — and the
    // server's is the one that describes the answer actually on screen.
    const pick = readPick(
      answer({
        answered_with: { slot: "capability_id", label: "Data Governance", value: "C1" },
        resolved_intent: { accepted_slots: { capability_id: "C8" } },
      } as Partial<Artifact>),
      ask(),
    );
    expect(pick!.value).toBe("C8");
    expect(pick!.label).toBe("Analytics & Reporting");
  });

  it("falls back to the client's record when the server recorded no slot", () => {
    // In-flight, before the producer's account exists.
    const pick = readPick(
      answer({ answered_with: { slot: "capability_id", label: "Analytics & Reporting", value: "C8" } }),
      ask(),
    );
    expect(pick).toEqual({ slot: "capability_id", label: "Analytics & Reporting", value: "C8" });
  });

  it("falls back to the ID as a label when the menu no longer lists it", () => {
    // A menu that has since changed is not a reason to show nothing.
    const pick = readPick(
      answer({ resolved_intent: { accepted_slots: { capability_id: "C99" } } } as Partial<Artifact>),
      ask(),
    );
    expect(pick).toEqual({ slot: "capability_id", label: "C99", value: "C99" });
  });

  it("returns NOTHING when neither side recorded a pick", () => {
    // A re-spoken ask binds nothing, so there is no pick — and the surfaces must then say only
    // what was asked rather than inventing a blank one.
    expect(readPick(answer(), ask())).toBeNull();
    expect(readPick(null, ask())).toBeNull();
    expect(readPick(answer({ resolved_intent: { accepted_slots: {} } } as Partial<Artifact>), ask())).toBeNull();
  });

  it("ignores a non-string slot value rather than rendering it", () => {
    expect(
      readPick(answer({ resolved_intent: { accepted_slots: { capability_id: 7 } } } as unknown as Partial<Artifact>), ask()),
    ).toBeNull();
  });
});

describe("both surfaces read the same rule", () => {
  const stripComments = (src: string) =>
    src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  it("neither reads `answered_with` directly any more", async () => {
    // The divergence was two files each deciding for themselves. A surface that goes back to
    // reading the client's record alone re-creates the exact gap that was on screen.
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    for (const rel of [
      "../components/HUD/DecisionPathDiagram.tsx",
      "../components/elicitation/AskedSection.tsx",
    ]) {
      const src = stripComments(readFileSync(path.join(__dirname, rel), "utf8"));
      expect(src, rel).toContain("readPick(");
      expect(src, rel).not.toMatch(/answered_with\?\.(value|label)/);
    }
  });
});

/**
 * EVERY BRANCH THAT DRAWS AN ANSWER MUST DRAW THE OFFER WITH IT.
 *
 * Mounted on `StageCard`'s PANEL branch and `CanvasPane`, the collapsed offer was invisible on
 * the canvas — because `sized` is true only for a card someone RESIZED away from the default,
 * so every card on the global board, INCLUDING THE FOCUSED ONE, renders through PREVIEW. The
 * branch whose name sounded like "the real one" is the branch almost nothing uses.
 *
 * That is the third time this shape has shipped: a prop threaded at two of five interpreter
 * sites, a chip mounted on one of two in-flight surfaces, and now a section on one of two
 * answer branches. So the rule is asserted over the POPULATION rather than the instances —
 * anywhere an answer's components are rendered, the offer is rendered beside them.
 */
describe("the offer is mounted wherever an answer is drawn", () => {
  it("every SemanticInterpreter that draws an artifact has an AskedSection beside it", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const ts = (await import("typescript")).default;

    const files = [
      "../components/AgenticCanvas/StageCard.tsx",
      "../components/AgenticCanvas/CanvasPane.tsx",
    ];
    const missing: string[] = [];
    let interpreters = 0;

    for (const rel of files) {
      const file = path.join(__dirname, rel);
      const src = readFileSync(file, "utf8");
      const sf = parseSourceOrThrow(file, src);
      const visit = (node: import("typescript").Node): void => {
        // Every JSX PARENT that contains an interpreter must also contain the section.
        if (ts.isJsxElement(node)) {
          const kids = node.children;
          const hasInterp = kids.some(
            (k) =>
              (ts.isJsxSelfClosingElement(k) && k.tagName.getText(sf) === "SemanticInterpreter") ||
              (ts.isJsxElement(k) && k.openingElement.tagName.getText(sf) === "SemanticInterpreter"),
          );
          if (hasInterp) {
            interpreters += 1;
            const hasAsked = kids.some(
              (k) => ts.isJsxSelfClosingElement(k) && k.tagName.getText(sf) === "AskedSection",
            );
            if (!hasAsked) {
              const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
              missing.push(`${rel.split("/").pop()}:${line + 1} — interpreter with no AskedSection`);
            }
          }
        }
        ts.forEachChild(node, visit);
      };
      ts.forEachChild(sf, visit);
    }

    // Positive control: the scan found interpreters at all. A walker that matched nothing would
    // report zero missing and read as a clean bill of health forever.
    expect(interpreters, "the scan found no interpreters — the walker is broken").toBeGreaterThanOrEqual(3);
    expect(missing, missing.join("\n")).toEqual([]);
  });
});
