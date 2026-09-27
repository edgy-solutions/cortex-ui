import { readFileSync } from "node:fs";
import path from "node:path";
/**
 * THE PERSONA IS A TAG ON THE ANSWER, NOT AN ELEMENT OF IT.
 *
 * `SemanticInterpreter` drew it as a bold 10px pill with 2.5 padding on its own line above
 * every component. On a canvas card that costs a full row of vertical — the same row the
 * interpretation strip cost before it moved to the footer — and it read as the loudest thing
 * on a card whose actual content is a chart.
 *
 * It now sits in the card's eyebrow beside the subject and verb, which is the line that
 * already answers "where did this come from". The interpreter keeps drawing it for surfaces
 * that have NO eyebrow — the pane, a pinned answer — because for those it is the only
 * attribution there is. Hence a prop and not a deletion.
 *
 * Source-level because the subject is where an element renders and whether it renders twice.
 */
import { describe, it, expect } from "vitest";

const CARD = readFileSync(path.join(__dirname, "StageCard.tsx"), "utf8");
const INTERP = readFileSync(
  path.join(__dirname, "../registry/SemanticInterpreter.tsx"),
  "utf8",
);

describe("the persona is shown once, in the eyebrow", () => {
  it("the card renders it inside the header, before the body", () => {
    const iHeader = CARD.indexOf("Header: subject identifier");
    const iBody = CARD.indexOf('className="flex-1 min-h-0 overflow-hidden relative"');
    // The FULL condition, not just the identifier: `personaCfg && (` also matches a chip
    // that has been disabled with a leading `false &&`, which is exactly how this would be
    // switched off in practice.
    const iChip = CARD.indexOf("{!task && personaCfg && (");
    expect(iHeader).toBeGreaterThan(0); // positive control
    expect(iChip).toBeGreaterThan(0); // the chip is actually rendered, not merely mentioned
    expect(iChip).toBeGreaterThan(iHeader);
    expect(iChip).toBeLessThan(iBody);
  });

  it("EVERY body the card mounts is told to suppress its own badge", () => {
    /*
      Missing one leaves a card showing the persona twice — once small in the eyebrow and once as
      the old block — which is worse than either alone.

      ⛔ COUNTED OVER BOTH NAMES, BECAUSE THE MOUNT MOVED. The card used to mount
      `SemanticInterpreter` directly; its two branches now go through `AnswerBody`, so a count of
      the old tag was ZERO — and zero mounts with zero suppressions is an equality that holds
      vacuously. The positive control below is the only reason that read as a failure rather than
      as a pass, which is what it is for. The renderer stays in the count so a branch that goes
      round the gateway is still required to suppress.

      ⚠ AND THE COUNT IS ONLY HALF THE CLAIM NOW: the prop reaches the badge through a gateway,
      so `AnswerBody` FORWARDING it is load-bearing here and cannot be seen from this file. It is
      sealed in `answerBody.test.tsx` — a gateway that accepted the prop and dropped it would
      leave every arm in this file green and the persona drawn twice on screen.
    */
    const mounts =
      CARD.split("<AnswerBody").length - 1 + (CARD.split("<SemanticInterpreter").length - 1);
    const suppressed = CARD.split("hidePersona").length - 1;
    expect(mounts, "the card mounts no answer body — this count is vacuous").toBeGreaterThan(0);
    expect(suppressed).toBe(mounts);
  });

  it("the interpreter still draws it when NOT suppressed", () => {
    // The pane and a pinned answer have no eyebrow; for them this badge is the only
    // attribution. A deletion would have silently removed it from those surfaces.
    expect(INTERP).toContain("pCfg && !hidePersona");
  });

  it("the badge is sized as a tag, not a button", () => {
    const badge = INTERP.slice(INTERP.indexOf("pCfg && !hidePersona"));
    expect(badge.slice(0, 400)).toContain("text-[8px]");
    expect(badge.slice(0, 400)).not.toContain("font-bold");
    expect(badge.slice(0, 400)).not.toContain("px-2.5");
  });

  it("an absent persona renders NO chip rather than a guess", () => {
    // The payload declares it or it is not shown. A card captioned with an inferred persona is
    // asserting an attribution nobody captured.
    expect(CARD).toContain("sourcePersona ? personaConfig[sourcePersona] : null");
  });
});
