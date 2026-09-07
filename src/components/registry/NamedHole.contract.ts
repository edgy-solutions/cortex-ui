/**
 * NAMED_HOLE — the card that exists to say WHY it is empty.
 *
 * ADR-0050 §5: "A panel whose verb the initiator cannot invoke renders as a NAMED HOLE: the card
 * exists and says why it is empty." The template declared the panel, so the panel's absence is a
 * fact the reader is entitled to — and per ADR-0049 Ruling 2 a narrowed result must SAY it was
 * narrowed. A silently shorter board is refused in every classification.
 *
 * ── IT MUST NOT LOOK LIKE AN EMPTY CARD, BECAUSE EMPTY ALREADY MEANS SOMETHING ────────────
 *
 * Blank is not spare capacity on these surfaces; it is a claim. The interpretation strip draws
 * NOTHING when no interpretation was captured, precisely so that a placeholder cannot occupy
 * the space where a real claim belongs. A hole that rendered as a faded box would be
 * indistinguishable from that — the reader would read "nothing was captured" where the truth is
 * "something is here and you may not have it". So the hole is a PRESENT card with a stated
 * reason, not a dimmer version of a card.
 *
 * ── THREE STATES, AND ONLY ONE OF THEM IS THIS CARD ───────────────────────────────────────
 *
 * ADR-0049 Ruling 4, as §5 tabulates it:
 *
 *   unentitled  — the caller may not invoke this panel's verb  → THIS CARD.
 *   unavailable — the verb failed, timed out, or was refused   → today's whole-board refusal
 *                                                                stands; a shifted board is the
 *                                                                confidently-wrong answer in
 *                                                                layout form.
 *   empty       — the verb answered and legitimately has nothing → the panel's OWN rowless card.
 *
 * A component that drew for all three would erase exactly the distinctions the ruling makes, so
 * the disposition is required and anything that is not `unentitled` is refused rather than
 * drawn generously.
 *
 * ── WHAT THIS CARD MAY NOT DECIDE: THE EXISTENCE ORACLE ───────────────────────────────────
 *
 * §5 flags and DOES NOT RULE whether the hole names the verb it could not invoke. "You are not
 * entitled to the program-cost panel" discloses that the panel exists and that this caller
 * lacks it, and in a compartmented context that emission may be the thing being protected. The
 * ADR assigns the decision to the enforcement overlay, per classification.
 *
 * SO THIS CARD DERIVES NOTHING. It renders the label the producer sent, the reason the producer
 * sent, and neither when neither came. A component that fell back to naming the verb from an
 * IRI it happens to hold would be deciding an emission policy that two ADRs deliberately left
 * open — and it would do so in the one direction that cannot be taken back.
 */

/** The disposition that produces this card. The other two states are not drawn here. */
export const NAMED_HOLE_DISPOSITION = "unentitled";

export const NAMED_HOLE_REFUSAL_REASONS = [
  "this is not a named hole",
  "the hole names no disposition",
] as const;
export type NamedHoleRefusal = (typeof NAMED_HOLE_REFUSAL_REASONS)[number];

export const NAMED_HOLE_CONTRACT = {
  archetype: "NAMED_HOLE",
  component: "NamedHole",
  layout: "full-width",
  /** Not a live view: entitlement is evaluated at dispatch, and this card reports one moment. */
  recomputes: false,
  fields: {
    /**
     * WHICH of ADR-0049 Ruling 4's three states produced this. Required, and required to be
     * `unentitled`: the other two have their own dispositions and drawing them here would
     * erase the distinction the ruling exists to make.
     */
    disposition: { type: "string", required: true },
    /**
     * The producer's words for why. OPTIONAL BY POLICY, not by oversight — see the existence
     * oracle above. Rendered verbatim; never synthesized when absent.
     */
    reason: { type: "string", required: false },
    /**
     * What the panel would have been. ALSO optional by policy: naming it is exactly the
     * disclosure a compartmented classification may withhold.
     */
    panel_label: { type: "string", required: false },
    /**
     * The verb, when the producer chose to disclose it. Rendered only if present; this card
     * never derives a name from an IRI it merely holds.
     */
    verb_iri: { type: "string", required: false },
  },
  refusalReasons: NAMED_HOLE_REFUSAL_REASONS,
} as const;

export type NamedHoleContract = typeof NAMED_HOLE_CONTRACT;

export interface NamedHolePayload {
  disposition: string;
  reason: string;
  panelLabel: string;
  verbIri: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Read a hole, or refuse it.
 *
 * REFUSES ANY DISPOSITION BUT `unentitled`, and that is the load-bearing negative. A card that
 * drew for `unavailable` would put a hole where the board should have refused whole, and a
 * shifted board is the confidently-wrong answer in layout form.
 */
export function validateNamedHole(
  comp: unknown,
): { kind: "ok"; hole: NamedHolePayload } | { kind: "empty"; reason: NamedHoleRefusal } {
  if (!isRecord(comp)) return { kind: "empty", reason: "this is not a named hole" };
  const disposition = str(comp.disposition);
  if (!disposition) return { kind: "empty", reason: "the hole names no disposition" };
  if (disposition !== NAMED_HOLE_DISPOSITION) {
    return { kind: "empty", reason: "this is not a named hole" };
  }
  return {
    kind: "ok",
    hole: {
      disposition,
      reason: str(comp.reason),
      panelLabel: str(comp.panel_label),
      verbIri: str(comp.verb_iri),
    },
  };
}
