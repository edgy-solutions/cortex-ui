/**
 * THE LOT 4 CONTRIBUTION_RANKING FIXTURE — AND EXACTLY HOW REAL EACH HALF OF IT IS.
 *
 * ── READ THIS BEFORE TREATING ANY OF IT AS A CAPTURE ──────────────────────────────────────
 *
 * The order this was built for says "using the lot 4 fixture" and seals it with "Fixture from
 * the real payload". Measured on 2026-09-24, against this repo, neither phrase has a referent:
 *
 *   1. THERE IS NO LOT 4 FIXTURE. The string `Lot 4` occurs in exactly one file in the repo —
 *      `ContributionRanking.test.tsx`, five times, as `scope_label="Lot 4"` on a render call.
 *      It is a label passed to a component in a test, not a stored payload.
 *
 *   2. NO CAPTURED PAYLOAD EVER PROJECTED TO CONTRIBUTION_RANKING. The nine finance captures in
 *      `sessions/` projected to KNOWLEDGE_DOCUMENT, VARIANCE_TREE ×2, SHORTFALL_GRID,
 *      MULTI_SERIES, ELICITATION ×2, COMPETING_MEASURES — and one with NO `projected` key at all
 *      (`from-32-np-meridian-brief.json`, which is not a captured answer; see the census test in
 *      `cardExportFinance.test.ts`). Not an empty projection — a different kind of document.
 *
 *   3. THE ONE CAPTURE THAT CONSIDERED THIS ARCHETYPE REFUSED IT, and said why. In
 *      `2026-09-19-payload-finance-np-meridian-brief.json`, at
 *      `presentation_provenance.refusals[]`:
 *
 *         archetype: "CONTRIBUTION_RANKING"
 *         reason:    "no typed contract for CONTRIBUTION_RANKING; and output_uri matched no
 *                     capability, so nothing declared this archetype for this answer"
 *
 *      So the absence is not a gap in the search. It is a recorded producer decision, with a
 *      stated cause, which `ContributionRanking.contract.ts` has since answered on this side
 *      (there IS a typed contract now) while the capability declaration half is still open.
 *
 * The order also says, of the method block, "never invent it". The same rule has to bind the
 * fixture or it binds nothing — a payload invented to satisfy a seal makes the seal measure the
 * inventor. So this file does not manufacture a capture. It composes the most real material
 * that exists and LABELS EACH HALF:
 *
 *   ROWS — from `ContributionRanking.test.tsx`, whose author annotated them
 *          "The producer's real row shape, field for field". That is a claim about SHAPE, and it
 *          is the strongest claim available. The three control accounts and their numbers are
 *          NOT a producer capture and must not be cited as one.
 *
 *   ENVELOPE — the key set the real captures carry around their rows, in the order they carry it,
 *          plus the fields the producer's own projector tuple declares for this archetype. Read
 *          from the producer at `agent_fleet/presentation_agent/main.py:752`:
 *
 *              "CONTRIBUTION_RANKING": ("rows", ("value_label", "value_unit", "scope_label",
 *                                                "verdict", "threshold", "threshold_defaulted"))
 *
 *          ⚠ THAT CORRECTS A STALE COMMENT ON THIS SIDE. `SemanticInterpreter.tsx` (at the
 *          CONTRIBUTION_RANKING case) says the tuple "names four fields which do not include"
 *          `threshold`/`threshold_defaulted`. It names six and it does include them — the producer
 *          added them after that comment was written. The comment is not corrected here because
 *          this order is about the export, but a reader who trusts it will reach the wrong
 *          conclusion about whose side a missing bound is on.
 *
 *          `threshold` and `threshold_defaulted` are still ABSENT from this fixture, for a
 *          better-measured reason than that comment gives: they are DECLARED BY THE PROJECTOR AND
 *          HAVE NEVER BEEN OBSERVED ON THE WIRE. No payload under `sessions/` carries either key.
 *          Declared and never seen is a third state, distinct from both "not wired" and
 *          "arriving", and a fixture that supplied them would test the card's bound-present branch
 *          against a shape nothing has yet produced. That branch is sealed in the card's own
 *          tests, where it belongs.
 *
 *   PROVENANCE — GENUINELY REAL, every field, lifted verbatim from
 *          `sessions/2026-09-19-payload-finance-variance-drivers.json`: `asked_as.persona`,
 *          `routing.action.label`, `routing.handled_by.engine_name`, `fleet_sha`, `prompt`.
 *          This is the half of the order's "from the real payload" that can be honoured today.
 *
 *   METHOD — NOT HERE AT ALL, and that is the point. `method` appears in no wire type and no
 *          capture. The export's absent-method path is the one that can be sealed today, and
 *          `LOT4_METHOD_PRESENT` below exists ONLY to prove the present-method renderer works;
 *          it is explicitly a constructed example, never a producer artifact.
 *
 * WHEN A REAL LOT 4 CONTRIBUTION_RANKING CAPTURE ARRIVES, replace the rows and the envelope here
 * and the seals should pass unchanged. If they do not, the fixture was carrying the test rather
 * than the test carrying the fixture, and that is worth knowing.
 */

import type { ContributionRow } from "@/components/planning/ContributionRanking.contract";
import type { ExportProvenance, MethodBlock } from "./cardExport";

/**
 * The rows, from the test annotated "The producer's real row shape, field for field".
 *
 * CA1 carries the three EVM quantities and CA2/CA3 do not — that unevenness is deliberate and
 * is copied, not smoothed. A fixture where every row carries every optional field cannot catch a
 * renderer that assumes they are always present, and this archetype's card declares seven
 * separate absence attributes precisely because they are not.
 */
export const LOT4_CONTRIBUTION_ROWS: ContributionRow[] = [
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
 * The payload as the card's props see it.
 *
 * KEY ORDER IS THE REAL CAPTURE'S, not alphabetical and not convenient: the four base fields in
 * the order `2026-09-19-payload-finance-variance-drivers.json` carries them, then the projector
 * tuple's declared fields in its own order. The export's payload table renders in document order,
 * so this is the order a reader will compare against the producer.
 *
 * `archetype` is carried INSIDE the payload because the real captures carry it there too — the
 * projected payload restates its own archetype, and an export that only took it from the envelope
 * would drop the producer's copy of the claim.
 *
 * `verdict` is a producer SENTENCE, not a code. The one here is the real capture's, verbatim, and
 * it is about the variance it was written for — which is a reminder that this is a composed
 * fixture and not a capture of Lot 4.
 */
export const LOT4_CONTRIBUTION_RANKING_PAYLOAD = {
  archetype: "CONTRIBUTION_RANKING",
  rows: LOT4_CONTRIBUTION_ROWS,
  source_persona: "PROGRAM_FINANCE_ANALYST",
  subject_concept: "NP-MERIDIAN",
  value_label: "cost variance",
  value_unit: "USD",
  scope_label: "Lot 4",
  verdict: "Integration and Test accounts for 97% of the variance",
} as const;

/**
 * Provenance, verbatim from the real capture. See the header — this half IS from a real payload.
 *
 * `roll_sha` is the capture's `fleet_sha`, which is the short form of the producer ref this
 * repo's CI pins (`PRODUCER_REF: c0005142a610bc…`). Short because that is what the producer
 * wrote; lengthening it here would be a derivation presented as a capture.
 */
export const LOT4_EXPORT_PROVENANCE: ExportProvenance = {
  persona: "PROGRAM_FINANCE_ANALYST",
  verb: "fin Variance Analysis",
  engine: "iagent-engine-fin",
  roll_sha: "c0005142",
  timestamp: "2026-09-19T00:00:00.000Z",
  question_asked: "which account is driving the overrun on NP-MERIDIAN",
};

/**
 * A CONSTRUCTED method block — not a producer artifact, and not evidence of one.
 *
 * Its only job is to drive the present-method branch of the renderer so that branch is not
 * shipped unexecuted. The absent-method branch is the one that matches reality today, and it is
 * sealed against `null`, not against this.
 */
export const LOT4_METHOD_PRESENT: MethodBlock = {
  formula: "contribution_i = ACWP_i - BCWP_i ; share_i = contribution_i / Σ|contribution|",
  inputs: [
    { name: "BCWP", value: "2200000" },
    { name: "ACWP", value: "3000000" },
    { name: "as_of", value: "2026-09-19" },
  ],
  bound: "|contribution| >= 100000",
};
