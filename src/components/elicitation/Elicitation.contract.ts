/**
 * ELICITATION — the ask. A request for one missing declaration, before any answer exists.
 *
 * Structural: it draws "I cannot answer this yet, here is the one thing I need, and here is
 * what you may say." Its first consumer is a mandatory slot the router could not fill;
 * ADR-0033's archetype-unity constraint makes this and ADR-0032's goal-shape card ONE
 * archetype, so nothing here is named for slots.
 *
 * ── WHAT IT REPLACES, AND WHY THAT WAS THE WRONG SHAPE ─────────────────────────────────────
 *
 * The backend emits a typed `slot_elicitation` status and has done for a while. With no
 * archetype registered for it, it fell through to KNOWLEDGE_DOCUMENT — so a question arrived
 * wearing an answer's clothes: a document-shaped card, in the answer rail, next to real
 * answers. The producer's own comment calls that out as the failure mode ("an unregistered
 * kind must degrade visibly, never borrow another species' affordances"), and its prose
 * fallback was written to be survivable rather than right.
 *
 * ── THE TWO ANSWER PATHS ARE NOT ONE PATH ─────────────────────────────────────────────────
 *
 * A MENU PICK BINDS. Its value came from a resolver candidate or a provider enumeration, so it
 * is already an identifier the verb accepts — that is menu integrity — and it rides back on the
 * accepted slots with NO second model call, so the second turn cannot parse the phrase
 * differently than the first did.
 *
 * FREE TEXT IS RE-SPOKEN, NEVER BOUND. A typed answer is WORDS. Binding
 * `project_id = "Wave 1 Cutover"` would put a human's typing where an id belongs and reach the
 * engine as a 422 — the exact failure the tri-state exists to prevent. So it re-enters as a
 * phrase and the filler and resolver run on it as they would on any question.
 *
 * ── THE PICK IS VALIDATED AGAINST WHAT WAS OFFERED, NOT AGAINST A VOCABULARY ───────────────
 *
 * A real, existing, perfectly valid id that was NOT on this menu is REFUSED. That is the whole
 * point: select-from-authorized-set enforced rather than prompted. An id the card never showed
 * cannot have come from the reader reading, and the one place it can have come from is
 * something inventing it.
 *
 * ── A THIRD MIRROR, AND THE REASON IS THE PRODUCER'S OWN ───────────────────────────────────
 *
 * `validate_pick` already exists twice in Python — `slot_disposition.py` mirrors
 * `spo_interview.py` rather than importing it, because engine images do not ship the package
 * that would carry the import. A browser cannot import either, so this is the third copy, and
 * it is pinned the same way they pin theirs: by a test asserting the behaviour, not by an
 * import that cannot exist. Exact string equality on `value`, closest suggested, refused
 * anyway — deliberately identical, including the part that looks unhelpful.
 */

export const ELICITATION_OPTION_SOURCES = [
  "resolution",
  "declaration",
  "enumeration",
  "none",
] as const;
export type ElicitationOptionSource = (typeof ELICITATION_OPTION_SOURCES)[number];

/**
 * Why an ask carries no menu. THE CLOSED SET IS THE POINT — free text is permitted only where
 * the substrate genuinely cannot enumerate, never as a default and never because enumeration
 * was not attempted. Two of these are a provider's own report; `no_provider` names a gap that
 * should disappear as providers register, and naming it is how anyone knows it is there.
 */
export const ELICITATION_FREE_TEXT_REASONS = [
  "too_many",
  "unsupported",
  "no_provider",
  "no_referent",
] as const;
export type ElicitationFreeTextReason = (typeof ELICITATION_FREE_TEXT_REASONS)[number];

/**
 * The producer's dispositions. ONE CARD SHAPE CARRIES ALL OF THEM, which is why the surface has
 * to read this field rather than assume: `status` is `slot_elicitation` on an abstain too.
 */
export const ASK = "ask";
export const ABSTAIN = "abstain";

export const ELICITATION_REFUSAL_REASONS = [
  "the ask names no slot",
  "this is not an ask",
] as const;
export type ElicitationRefusal = (typeof ELICITATION_REFUSAL_REASONS)[number];

export const ELICITATION_CONTRACT = {
  archetype: "ELICITATION",
  // THE DISPATCHED COMPONENT, NOT THE PURE ONE. `AskCard` draws the question and takes no
  // hook; `AskCardConnected` is what the interpreter renders, because everything that talks to
  // the send path lives there. Advertising the inner name would be a stale advertisement of
  // exactly the kind the dispatch seal exists to catch — it checks the mapping, not membership.
  component: "AskCardConnected",
  layout: "full-width",
  /** Not a live view: an ask is a moment, not a state that re-evaluates. */
  recomputes: false,
  fields: {
    /** Which declaration is missing. */
    slot: { type: "string", required: true },
    /** The menu, `[{ value, label }]`. EMPTY is meaningful — see `free_text_reason`. */
    options: { encoding: "array", parsesTo: "array-of-objects", required: false },
    /** Where the menu came from. Rendered distinguishably; see the component. */
    option_source: { type: "string", required: false },
    /** Why there is no menu, from the closed set. Required WHENEVER options are empty. */
    free_text_reason: { type: "string", required: false },
    /** What the reader said for this slot, when they said anything. */
    spoken: { type: "string", required: false },
    /** A cross-class candidate: what WAS found, kept as context rather than offered. */
    found: { type: "string", required: false },
    /** The original phrase, so the re-route has something to re-speak. */
    sub_query: { type: "string", required: false },
    /**
     * The slots the first turn already filled. LOAD-BEARING: a re-route binding only the
     * answered slot would suppress every other slot the first turn got right.
     */
    accepted_slots: { encoding: "object", parsesTo: "object", required: false },
    /** The producer's honest prose, for any surface that cannot draw a menu. */
    message: { type: "string", required: false },
    /** How many candidates existed before the menu bound. 0 when untruncated. */
    truncated_from: { type: "number", required: false },
  },
  refusalReasons: ELICITATION_REFUSAL_REASONS,
} as const;

export type ElicitationContract = typeof ELICITATION_CONTRACT;

export interface AskOption {
  value: string;
  label: string;
}

export interface AskCardPayload {
  slot: string;
  options: AskOption[];
  option_source: string;
  free_text_reason: string | null;
  spoken: string;
  found: string;
  sub_query: string;
  accepted_slots: Record<string, unknown>;
  message: string;
  truncated_from: number;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/**
 * Read the card, and decide WHETHER IT IS A QUESTION AT ALL.
 *
 * THE DISPOSITION IS NOT DECORATION. The producer emits one card shape for `route | ask |
 * abstain`, all three carrying `status: "slot_elicitation"`, so a surface that switches on the
 * status alone will draw an answer field on an abstain — and an abstain says the opposite of an
 * ask: nothing was run and there is NOTHING TO CHOOSE FROM. A reply to it cannot route, so
 * offering one asks a person to do something that can only fail. Its honest prose is rendered
 * instead, which is what that prose was written for.
 */
export function validateAsk(
  comp: unknown,
):
  | { kind: "ok"; ask: AskCardPayload }
  | { kind: "abstained"; message: string }
  | { kind: "empty"; reason: ElicitationRefusal } {
  if (!isRecord(comp)) return { kind: "empty", reason: "this is not an ask" };

  const disposition = str(comp.disposition);
  if (disposition && disposition !== ASK) {
    if (disposition === ABSTAIN) {
      return {
        kind: "abstained",
        message: str(comp.message) || "Nothing was run.",
      };
    }
    // `route` never reaches a surface as a card, so anything else here is a shape this
    // component does not know. Refused rather than guessed at.
    return { kind: "empty", reason: "this is not an ask" };
  }

  const slot = str(comp.slot).trim();
  // NO SLOT, NO ASK. A card that cannot name what it wants is not a question, and the
  // re-route refuses it for the same reason on the other side of the wire.
  if (!slot) return { kind: "empty", reason: "the ask names no slot" };

  const rawOptions = Array.isArray(comp.options) ? comp.options : [];
  const options: AskOption[] = [];
  for (const o of rawOptions) {
    if (!isRecord(o)) continue;
    const value = str(o.value);
    if (!value) continue;
    options.push({ value, label: str(o.label) || value });
  }

  return {
    kind: "ok",
    ask: {
      slot,
      options,
      option_source: str(comp.option_source),
      free_text_reason: str(comp.free_text_reason) || null,
      spoken: str(comp.spoken),
      found: str(comp.found),
      sub_query: str(comp.sub_query),
      accepted_slots: isRecord(comp.accepted_slots) ? comp.accepted_slots : {},
      message: str(comp.message),
      truncated_from: typeof comp.truncated_from === "number" ? comp.truncated_from : 0,
    },
  };
}

/** Thrown when a pick was not in the set that was offered. */
export class PickRefused extends Error {}

/**
 * Select-from-authorized-set, enforced rather than prompted.
 *
 * Exact equality on `value`, and on `value` ALONE — a label is what a person reads, an id is
 * what the verb takes, and accepting a label would mean the card deciding which of the two the
 * caller meant. Closest matches are named because that helps a caller correct itself, and the
 * pick is refused anyway because naming a near miss is not accepting one.
 */
export function validatePick(pick: string, options: readonly AskOption[]): string {
  const allowed = options.map((o) => o.value);
  if (allowed.includes(pick)) return pick;
  const close = allowed.filter(
    (a) =>
      pick && (a.toLowerCase().includes(pick.toLowerCase()) || pick.toLowerCase().includes(a.toLowerCase())),
  );
  throw new PickRefused(
    `${JSON.stringify(pick)} was not one of the options offered. ` +
      (close.length ? `Closest: ${close.slice(0, 3).join(", ")}.` : "No close match."),
  );
}

export const BIND = "bind" as const;
export const RESPEAK = "respeak" as const;

export interface Reroute {
  action: typeof BIND | typeof RESPEAK;
  /** For BIND: the merged, ready-to-dispatch parameters. */
  slots: Record<string, unknown>;
  /** For RESPEAK: the phrase to re-issue. */
  query: string;
  slot: string;
}

/**
 * Turn a reader's answer into the next route. A port of the producer's `resolve_ask`, and
 * deliberately identical — including the phrase RESPEAK composes, so the two sides cannot
 * disagree about what was asked.
 *
 * A menu was offered → the answer must be ON it, and BINDS. No menu → the answer is words and
 * is RE-SPOKEN. There is no third branch, and "no menu" never means "anything is acceptable":
 * every `free_text_reason` says why a list could not be offered, not that one was unnecessary.
 */
export function resolveAsk(ask: AskCardPayload, answer: string): Reroute {
  const a = (answer || "").trim();
  if (!ask.slot) throw new PickRefused("the card names no slot; nothing can be answered");
  if (!a) throw new PickRefused("an empty answer is not a pick");

  if (ask.options.length > 0) {
    const value = validatePick(a, ask.options);
    return { action: BIND, slots: { ...ask.accepted_slots, [ask.slot]: value }, query: "", slot: ask.slot };
  }
  return {
    action: RESPEAK,
    slots: { ...ask.accepted_slots },
    query: `${ask.sub_query} (${ask.slot}: ${a})`.trim(),
    slot: ask.slot,
  };
}
