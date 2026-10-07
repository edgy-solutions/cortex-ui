/**
 * THE LOT 4 CONTRIBUTION_RANKING FIXTURE — NOW A REAL CAPTURE, AND WHAT THAT CHANGED.
 *
 * ── PROVENANCE OF THESE BYTES ──────────────────────────────────────────────────────────────
 *
 * From `sessions/2026-09-26-capture-from-lane-1-the-lot-4-contribution-ranking-card-real-and-
 * post-projector.md` — Lane 1's capture off the running sandbox fleet, post-projector, the whole
 * `final_payload` plus a 15-event stream. Every envelope value and every row below is verbatim
 * from it. Nothing here is composed any more, which is the entire difference from the version
 * this file carried until 2026-09-26.
 *
 * ⛔ AND THE FIXTURE IS NOW CHECKED AGAINST THOSE BYTES, which it was not when it was typed. The
 * claim "verbatim from the capture" was written by the same hand that typed the values, so until
 * `cardExport.fixture.test.ts` existed a transposed digit or a tidied trailing zero would have
 * passed every export seal in the repo — those seals compare the document to THIS FILE, and would
 * have agreed with each other about the wrong number. The fenced block from Lane 1's report is
 * extracted to `sessions/2026-09-26-payload-lot4-contribution-ranking.json` (byte for byte apart
 * from line endings, and that extraction is itself asserted against the report), and every value
 * below is compared to it. Measured: tidying `"0.4100"` to `"0.41"` turns four seals red.
 *
 * The extraction exists for a second reason. The corpus instruments in
 * `cardExportFinance.test.ts` glob `sessions/*payload*.json`, so a capture delivered as `.md` is
 * invisible to all of them — which is not hypothetical: the never-observed seal in
 * `projectedTupleParity.test.ts` stayed GREEN on the day it became false, for exactly that reason.
 *
 * Two things the capture says about itself, which a reader of a fixture never otherwise learns:
 *
 *   1. IT IS A REAL SUCCESS, NOT A REPEATABLE ONE. The same census row was fired three times and
 *      passed 2 of 3; the failing fire answered `route_status: no_match`, archetype
 *      KNOWLEDGE_DOCUMENT, against an unchanged tree and identical fleet shas. So a local
 *      reproduction that comes back `no_match` is NOT evidence that the call was made wrong.
 *
 *   2. `threshold_defaulted` IS `true`. Nobody asked for 0.25 — it is the engine's default. A card
 *      cannot honestly render it as the analyst's bound, and the caller-supplied path is
 *      UNMEASURED: this capture is not evidence about it in either direction.
 *
 * ── WHAT THE OLD HEADER CLAIMED, AND WHICH OF IT THE CAPTURE SETTLED ───────────────────────
 *
 * This file used to open by recording that no lot 4 fixture existed and that the one capture
 * which considered this archetype REFUSED it, for a two-clause reason:
 *
 *     "no typed contract for CONTRIBUTION_RANKING; and output_uri matched no capability, so
 *      nothing declared this archetype for this answer"
 *
 * ⛔ BOTH CLAUSES ARE NOW CLOSED, and the second one was still reported as open upstream on
 * 2026-09-25. This capture's `presentation_provenance` settles it in its own words:
 *
 *     presentation_source   "registered"        (not "unrenderable")
 *     selection_basis       "output_uri+payload"
 *     candidates_considered 1, candidates_satisfied 1
 *     refusals              []                  (empty, not absent)
 *
 * The output_uri matched, one capability was satisfied, and nothing was refused. A refusal is
 * worth more than an absence precisely because this can happen: the recorded reason named the two
 * conditions, and both can now be checked rather than guessed at.
 *
 * ── THE ROW SHAPE IS NOT THE ONE THIS SIDE DECLARES ────────────────────────────────────────
 *
 * ⛔ THE SINGLE MOST IMPORTANT THING IN THIS FILE. The rows the fleet actually sends and the rows
 * `ContributionRanking.contract.ts` declares are different sets, in BOTH directions, measured:
 *
 *   ON THE WIRE, NOT DECLARED BY OUR CONTRACT:
 *     `above_threshold`  per-row, and the flag a card needs to mark rows over the bound
 *     `rank`, `amount`, `share_of_purchased`, `supplier`, `value_unit`
 *
 *   DECLARED BY OUR CONTRACT, ABSENT FROM THE WIRE:
 *     `favourable` — and the contract's own comment says the sign's meaning "must not be
 *                    inferred", that it is the producer's to state. ON THIS PAYLOAD THE PRODUCER
 *                    DOES NOT STATE IT. That is not a contract bug and not a producer bug; it is
 *                    a measured hole, and inferring from `contribution > 0` is the exact thing
 *                    the contract forbids.
 *     `bcws`, `bcwp`, `acwp`, `variance_kind`, `note`
 *
 * The divergence is asserted, both directions, in `cardExport.test.tsx` — so the day the contract
 * grows `above_threshold` or the producer drops `rank`, a test says so instead of a comment.
 *
 * Note that `above_threshold` is NOT silently dropped by the card: it renders as
 * "above_threshold — not drawable here". The card's own tests pin that, including the case where
 * the same sentence appeared for rows over the bound and under it — a real indistinguishability,
 * already caught there.
 *
 * ── METHOD: STILL ABSENT, AND NOW MEASURED RATHER THAN ASSUMED ─────────────────────────────
 *
 * ⛔ THERE IS NO `method` KEY ANYWHERE IN THE REAL CAPTURE. Not on `components[0]`, not on the
 * envelope. The order this work came from said to "render the `method` block from the real wire";
 * the real wire carries no method block, so that clause has no referent and NOTHING WAS INVENTED
 * TO SATISFY IT.
 *
 * This also CORRECTS A PREDICTION recorded in the 2026-09-25 report, which said the eight
 * `method not supplied` assertions in `cardExportFinance.test.ts` "WILL GO RED, by design" once a
 * real capture landed. They do not. The capture landed and they stay green, because the producer
 * sends no method for this archetype. A prediction about a test is owed the same suspicion as the
 * test — the absent-method path remains the one that matches reality.
 *
 * `LOT4_METHOD_PRESENT` therefore stays a CONSTRUCTED example and is still the only thing driving
 * the present-method branch. Its job is to keep that branch from shipping unexecuted; it is not
 * evidence that any producer has ever sent one.
 */

import type { ContributionRow } from "@/archetypes/contribution-ranking/contract";
import type { ExportProvenance, MethodBlock } from "./cardExport";

/**
 * A row AS THE FLEET SENDS IT, which is a superset and a subset of `ContributionRow` at once.
 *
 * Declared separately and deliberately NOT as `ContributionRow`: typing these as the contract's
 * row would either fail on the excess properties or, cast, hide the divergence the header
 * measures. The export flattens whatever payload it is given, so it needs no contract type — and
 * this fixture's job is to carry what arrived, not what we wish had.
 */
export interface Lot4WireRow {
  above_threshold: boolean;
  /** A STRING, beside a numeric `contribution` of the same quantity. Both are sent. */
  amount: string;
  contribution: number;
  /** The supplier's name, in all three of `entity_id`, `entity_name` and `supplier`. */
  entity_id: string;
  entity_name: string;
  rank: number;
  /** Also a string, beside a numeric `share_of_total`. Same mixture, same row. */
  share_of_purchased: string;
  share_of_total: number;
  supplier: string;
  value_unit: string;
}

/**
 * The four rows, verbatim from the capture.
 *
 * ⚠ THE STRING/NUMBER MIXTURE IS REAL AND IS COPIED, NOT NORMALISED. `amount` is `"604963.20"`
 * while `contribution` is `604963.2`; `share_of_purchased` is `"0.4100"` while `share_of_total` is
 * `0.41`. Lane 1 states this is what the fleet sends and not a transcription artefact, and a
 * consumer that assumes one or the other breaks on real data. A fixture that tidied it up would
 * hand every downstream seal a shape the producer does not send.
 *
 * `entity_id` is the supplier's NAME, not an id — there is no opaque key in this payload. Two
 * suppliers with one name would therefore collide, which is the indistinguishability the card's
 * own tests already cover.
 */
export const LOT4_WIRE_ROWS: Lot4WireRow[] = [
  {
    above_threshold: true,
    amount: "604963.20",
    contribution: 604963.2,
    entity_id: "Cobalt Components",
    entity_name: "Cobalt Components",
    rank: 1,
    share_of_purchased: "0.4100",
    share_of_total: 0.41,
    supplier: "Cobalt Components",
    value_unit: "USD",
  },
  {
    above_threshold: true,
    amount: "398390.40",
    contribution: 398390.4,
    entity_id: "Amber Fabrication",
    entity_name: "Amber Fabrication",
    rank: 2,
    share_of_purchased: "0.2700",
    share_of_total: 0.27,
    supplier: "Amber Fabrication",
    value_unit: "USD",
  },
  {
    above_threshold: false,
    amount: "280348.80",
    contribution: 280348.8,
    entity_id: "Sable Castings",
    entity_name: "Sable Castings",
    rank: 3,
    share_of_purchased: "0.1900",
    share_of_total: 0.19,
    supplier: "Sable Castings",
    value_unit: "USD",
  },
  {
    above_threshold: false,
    amount: "191817.60",
    contribution: 191817.6,
    entity_id: "Verdigris Electronics",
    entity_name: "Verdigris Electronics",
    rank: 4,
    share_of_purchased: "0.1300",
    share_of_total: 0.13,
    supplier: "Verdigris Electronics",
    value_unit: "USD",
  },
];

/**
 * The payload as the browser receives it — `final.components[0]`, verbatim.
 *
 * KEY ORDER IS THE CAPTURE'S OWN, which happens to be alphabetical because that is how the
 * producer serialises it. It is not sorted here; the export's payload table renders in document
 * order, so this is the order a reader compares against the producer.
 *
 * WHAT ARRIVED AGAINST WHAT THE PROJECTOR DECLARES — five of six, and the sixth is not a
 * transcription gap. The tuple at `agent_fleet/presentation_agent/main.py:752` declares
 * `("rows", ("value_label", "value_unit", "scope_label", "verdict", "threshold",
 * "threshold_defaulted"))`:
 *
 *     value_label          ARRIVED   "Purchased value"
 *     value_unit           ARRIVED   "USD"
 *     scope_label          ARRIVED   "Lot 4"
 *     verdict              ABSENT    — declared, and not on this wire
 *     threshold            ARRIVED   "0.25"   ⚠ A STRING, not a number
 *     threshold_defaulted  ARRIVED   true     ⚠ so the bound is the ENGINE'S DEFAULT
 *
 * And two fields arrived that the tuple does NOT declare — `source_persona` and
 * `subject_concept` — so the tuple is not an exhaustive account of the envelope. Whether it was
 * ever meant to be is the producer's question, not a defect this side can call.
 *
 * `subject_concept` arrives as `null`, not absent. Null is a value the producer sent; treating it
 * as a missing key would lose the distinction the export exists to preserve.
 */
export const LOT4_CONTRIBUTION_RANKING_PAYLOAD = {
  archetype: "CONTRIBUTION_RANKING",
  rows: LOT4_WIRE_ROWS,
  scope_label: "Lot 4",
  source_persona: "COST_ANALYST",
  subject_concept: null,
  threshold: "0.25",
  threshold_defaulted: true,
  value_label: "Purchased value",
  value_unit: "USD",
} as const;

/**
 * ⛔ RETIRED 2026-09-26 — SHAPE-ONLY ROWS, SUPERSEDED BY `LOT4_WIRE_ROWS`.
 *
 * These were composed from `ContributionRanking.test.tsx`, whose author annotated them "the
 * producer's real row shape, field for field". The capture shows that annotation was wrong about
 * this verb: the fleet sends no `favourable`, no `bcws`/`bcwp`/`acwp`, and sends six fields these
 * rows do not have. **They must not be cited as a producer capture, and the export seals no
 * longer run on them.**
 *
 * THEY ARE KEPT, NOT DELETED, FOR ONE REASON: the unevenness. CA1 carries the three EVM
 * quantities and CA2/CA3 do not, and `favourable` is present — so these rows exercise the card's
 * optional-field absence attributes and its "do not infer the sign" path, neither of which the
 * real capture can reach, because the real capture carries none of those fields at all. Deleting
 * them would silently drop that coverage and the suite would still be green.
 *
 * So: real data for the export, retired data for the branches real data cannot reach — and each
 * labelled as what it is.
 */
export const RETIRED_SHAPE_ONLY_ROWS: ContributionRow[] = [
  {
    entity_id: "CA1",
    entity_name: "Control Account 3.1",
    contribution: -800000,
    share_of_total: 0.62,
    favourable: false,
    bcws: 3000000,
    bcwp: 2200000,
    acwp: 3000000,
  },
  {
    entity_id: "CA2",
    entity_name: "Control Account 4.2",
    contribution: -300000,
    share_of_total: 0.23,
    favourable: false,
  },
  {
    entity_id: "CA3",
    entity_name: "Control Account 2.7",
    contribution: 120000,
    share_of_total: 0.09,
    favourable: true,
  },
];

/**
 * Provenance — five fields from THIS capture's own `route_decision` event, one from Lane 1's
 * prose, and no longer anything borrowed from a different answer's payload.
 *
 * ⛔ `question_asked` IS NOT IN THE EVENT STREAM. Persona, verb and engine are read off
 * `route_decision`; the question text appears only in the report's prose, where Lane 1 states the
 * census row that was fired. An earlier version of this comment said provenance came "from THIS
 * capture's own route_decision event" without qualification, which was true of five fields and
 * not of the sixth. The split is asserted per field in `cardExport.fixture.test.ts`.
 *
 * `roll_sha` and `timestamp` are `null` BECAUSE THE CAPTURE CARRIES NEITHER. The previous version
 * filled `roll_sha` from an unrelated capture's `fleet_sha`; there is no `fleet_sha` anywhere in
 * these bytes, and a value lifted from another answer would be a derivation presented as a
 * capture. The export renders an absence for null, which is the honest output.
 *
 * `endpoint_url` from the same event is redacted in the capture (a cluster-internal DNS name),
 * which is why no endpoint appears here — the export's provenance block never carried one.
 */
export const LOT4_EXPORT_PROVENANCE: ExportProvenance = {
  persona: "COST_ANALYST",
  verb: "cost Supplier Concentration",
  engine: "iagent-engine-cost",
  roll_sha: null,
  timestamp: null,
  question_asked: "how concentrated is purchasing on lot 4",
};

/**
 * A CONSTRUCTED method block — not a producer artifact, and now measured not to be one.
 *
 * The real capture has no `method` key at all (see the header). Its only job is to drive the
 * present-method branch of the renderer so that branch is not shipped unexecuted. The
 * absent-method branch is the one that matches reality, and it is sealed against `null`.
 *
 * ── WIDENED 2026-09-27, AND WHAT EACH NEW FIELD IS SET TO IS A DECISION ───────────────────────
 *
 * `MethodBlock` grew `unit`, `bound_defaulted`, `producer_sha` and `boundUnreadable`. Because this
 * block is CONSTRUCTED, every value here is a choice, and the license the header grants is narrow:
 * drive the renderer's branches, invent no facts.
 *
 * - **`bound` moved into `boundUnreadable`, unchanged in text.** `|contribution| >= 100000` was
 *   always a SENTENCE, and `bound` is now `number | null` because upstream is `Optional[float]`.
 *   A conformant producer can no longer send this — so the sentence is not deleted, it is filed
 *   where an unparseable bound belongs. Deleting it would have quietly removed the only case in
 *   the repo that proves the unreadable branch is reachable from a real shape someone once wrote.
 * - **`bound` is `null` here, so this fixture does NOT cover the numeric branch** — including the
 *   zero bound, which is the one that used to render as "absent". Those cases live in
 *   `cardExport.test.tsx` as small blocks per branch; a single fixture cannot cover a tri-state
 *   and two numeric edges at once, and stretching it to try is how a fixture starts asserting
 *   things nobody checked.
 * - **`bound_defaulted` is `null`** — "the producer did not say". Not `false`: this block's
 *   provenance is a construction, and `false` would assert the caller chose a bound that nobody
 *   chose. Null is the honest value for a fact no capture carries.
 * - **`producer_sha` is `null`** for the same reason, and it is the stronger case: a sha is a
 *   FACT about which code ran, and there is no image behind this block. Making one up would be
 *   the invention this file's header spends nine lines refusing.
 * - **Input values keep JSON types, mixed on purpose.** `BCWP`/`ACWP` are numbers because the
 *   producer computes them as floats, `as_of` is a string because a date is one. A block whose
 *   values were all strings could not tell a passing reader from one that stringifies.
 * - **Units on the two monetary inputs, `null` on the date.** Both unit branches, once each —
 *   which is the fixture's stated job — and a currency on a currency figure is the renderer's
 *   case rather than a claim about lot 4.
 */
export const LOT4_METHOD_PRESENT: MethodBlock = {
  formula: "contribution_i = ACWP_i - BCWP_i ; share_i = contribution_i / Σ|contribution|",
  inputs: [
    { name: "BCWP", value: 2200000, unit: "USD" },
    { name: "ACWP", value: 3000000, unit: "USD" },
    { name: "as_of", value: "2026-09-19", unit: null },
  ],
  bound: null,
  boundUnreadable: "|contribution| >= 100000",
  bound_defaulted: null,
  producer_sha: null,
};

/**
 * THE PRE-READER METHOD SHAPE THE PRODUCER NOW EMITS FOR THIS EXACT VERB.
 *
 * ⛔ NOT A CAPTURE, AND THE DISTINCTION IS THE WHOLE LABEL — but not a guess either. The field
 * names and their types are transcribed from `_method`'s own `return` in
 * `agent_fleet/cost_agent/measures.py`, and the `formula` and the five input NAMES from
 * `cost_supplier_concentration`'s call to it, added upstream in `546e6bee` (2026-09-24). Lane 1's
 * bytes carry no `method` key, so this is what a capture WILL carry once the sandbox runs an image
 * that includes that commit.
 *
 * WHY IT IS HERE RATHER THAN HAND-COMPOSED FROM `MethodBlock`. `LOT4_METHOD_PRESENT` above is a
 * POST-`readMethod` block — already in the shape this side wants, which is exactly why it cannot
 * exercise the reading. This one carries the producer's field names and types, INCLUDING the three
 * things `readMethod` drops. `cardExport.test.tsx` runs the reader over it and asserts both what
 * survives and what is lost.
 *
 * WHICH VALUES ARE GROUNDED, one by one, because a fixture that mixes captured and composed
 * values without saying which is which is a derivation presented as a capture:
 *
 *   `threshold` input, `bound`, `bound_defaulted`   the capture's own `threshold` / `threshold_defaulted`
 *   `lot`                                          the capture's `scope_label`, "Lot 4"
 *   `suppliers`                                    the capture's `rows.length`
 *   `total purchased value`                        SUMMED FROM THE CAPTURE'S FOUR `amount` STRINGS,
 *                                                  which is the same arithmetic the producer does —
 *                                                  a derivation, and `cardExport.fixture.test.ts`
 *                                                  recomputes it rather than trusting this line
 *   `fiscal_year`, `producer_sha`                  ⛔ NOT IN THE CAPTURE AT ALL, and their values
 *                                                  here say so in words rather than pretending
 *
 * ⚠ AND THAT LAST ROW IS A FINDING, not bookkeeping. `fiscal_year` appears NOWHERE in those bytes —
 * not in the component, not in any event — because the projector's allowlist strips it, along with
 * `lot`, `purchased_value`, `largest_share` and `suppliers_above_threshold`. THE METHOD BLOCK IS
 * THE ONLY PLACE THREE OF THOSE WOULD REACH A READER: stated among the inputs, they arrive as part
 * of the producer's account of its own arithmetic instead of as envelope fields no allowlist
 * admits. So the absent `method` costs more than a formula — it costs the reader every input they
 * would need to recompute the figure.
 *
 * ⚠ `bound` IS A FLOAT AND `bound_defaulted` A BOOLEAN. The producer's docstring records that it
 * narrowed `bound` away from a sentence ("threshold = 0.30 (stated by the caller)") to a bare
 * number, because engine-finance emits this same archetype and "two engines sending two shapes
 * under one field name is exactly the drift a reconciliation exists to stop". What the narrowing
 * costs is the attribution, which now "survives only in `bound_defaulted`, which the consumer
 * drops. That last is a cortex-side gap, reported and not patched from here." It is still dropped
 * — measured, on this side, by the seal below rather than taken from that sentence.
 */
export const LOT4_PRODUCER_METHOD_RAW = {
  formula:
    "contribution = the supplier's purchased amount in this lot; " +
    "share_of_purchased = amount / total purchased value; " +
    "above_threshold = share_of_purchased > threshold (strictly greater: a supplier " +
    "sitting exactly ON the bound is not above it); " +
    "rank = position by descending amount",
  inputs: [
    { name: "lot", value: "4" },
    { name: "fiscal_year", value: "<not in the capture: the projector strips it>" },
    // THE ONE INPUT WITH A UNIT, and the producer omits the key rather than sending null when no
    // unit is stated — absent means "not stated", not "dimensionless". `MethodInput` has no unit
    // field, so this is the third thing dropped.
    { name: "total purchased value", value: "1475520.00", unit: "USD" },
    { name: "suppliers", value: "4" },
    { name: "threshold", value: "0.25" },
  ],
  bound: 0.25,
  bound_defaulted: true,
  producer_sha: "<not in the capture: baked at the producer's build>",
} as const;
