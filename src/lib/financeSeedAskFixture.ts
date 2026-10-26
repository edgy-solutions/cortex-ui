/**
 * Built from invincible-agent #97 at 473f9c40 (unmerged): gateway.py:3720-3775, 3894-3910;
 * slot_disposition.py ask_card.
 *
 * The `detail` of a `POST /canvas/seed` 409 for `program_finance` with `program` unbound, in the
 * shapes the route can answer. The ids are the producer's own test data
 * (tests/planning/test_finance_canvas_asks_which_program.py at that head): NP-MERIDIAN,
 * "Notional Program Meridian", `binding_slot: "program"`, `ask.slot: "program_id"` (the
 * dispatch identity, which is NOT the name a caller re-sends under).
 *
 * Hand-built from the producer's code, not captured from a live 409: #97 is not rolled.
 */

export const FINANCE_TEMPLATE_ID = "program_finance";

const MERIDIAN_MESSAGE = "Which program did you mean? Notional Program Meridian";

/** The chat path's own ask card, as `ask_card` builds it. */
const askCard = {
  status: "slot_elicitation",
  disposition: "ask",
  output_uri: "slot_elicitation",
  verb_iri: "mesh:seedCanvas",
  sub_query: `seed canvas ${FINANCE_TEMPLATE_ID}`,
  slot: "program_id",
  reason: "",
  spoken: "",
  found: "",
  options: [{ value: "NP-MERIDIAN", label: "Notional Program Meridian" }],
  option_source: "enumeration",
  free_text_reason: null,
  truncated_from: 0,
  total_count: 1,
  scoped_by: [],
  bound_slots_offered: [],
  accepted_slots: {},
  message: MERIDIAN_MESSAGE,
};

/** (a) an ask with one option, and the slot name a picker re-sends under. */
export const SEED_409_ASK = {
  error: "unbound_required_slot",
  message: MERIDIAN_MESSAGE,
  ask: { ...askCard, template_id: FINANCE_TEMPLATE_ID, binding_slot: "program" },
} as const;

/** (b) an abstain: the caller can see no program, so there is a policy and nothing to choose. */
export const SEED_409_POLICY = {
  error: "unbound_required_slot",
  message:
    "You hold PROGRAM_FINANCE_ANALYST · PROGRAM_FINANCE, but this was asked from another cell, which can see no program. Choose PROGRAM_FINANCE_ANALYST · PROGRAM_FINANCE and ask again.",
  ask: {
    ...askCard,
    status: "slot_abstain",
    disposition: "abstain",
    options: [],
    total_count: 0,
    message: "No program is visible to you.",
    template_id: FINANCE_TEMPLATE_ID,
    binding_slot: "program",
    policy: {
      cell: { persona: "PROGRAM_FINANCE_ANALYST", domain: "PROGRAM_FINANCE" },
      groups: ["finance-analysts"],
      repair: "switch_cell",
      message:
        "You hold PROGRAM_FINANCE_ANALYST · PROGRAM_FINANCE, but this was asked from another cell, which can see no program. Choose PROGRAM_FINANCE_ANALYST · PROGRAM_FINANCE and ask again.",
    },
  },
} as const;

/** (c) the ask builder threw; the 409 keeps its plain refusal. */
export const SEED_409_ASK_UNAVAILABLE = {
  error: "unbound_required_slot",
  message: "program_finance needs program bound before it can seed.",
  ask: { error: "ask_unavailable", detail: "TimeoutError" },
} as const;

/** (d) no ask at all: what a cortex-bff that has not rolled #97 answers. */
export const SEED_409_NO_ASK = {
  error: "unbound_required_slot",
  message: "program_finance needs program bound before it can seed.",
} as const;

/** (e) an ask that cannot be re-sent: no `binding_slot`. */
const { binding_slot: _dropped, ...askWithoutBindingSlot } = SEED_409_ASK.ask;
void _dropped;
export const SEED_409_ASK_NO_BINDING_SLOT = {
  error: "unbound_required_slot",
  message: MERIDIAN_MESSAGE,
  ask: askWithoutBindingSlot,
} as const;

/** (f) a chat-path refusal envelope carrying (a)'s ask, without `binding_slot`. */
export const REFUSAL_ENVELOPE_WITH_ASK = {
  archetype: "KNOWLEDGE_DOCUMENT",
  refusal: {
    refused: true,
    outcome: "unbound_required_slot",
    reason: "program_finance needs program bound before it can seed.",
    ask: askWithoutBindingSlot,
  },
} as const;
