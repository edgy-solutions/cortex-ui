/**
 * CONTRIBUTION_RANKING — N entities ordered by how much each contributes to ONE total.
 *
 * Structural: it draws "of this total, THESE things account for THIS much, in this order."
 * Its first consumer is variance drivers; nothing here knows the word.
 *
 * ── THE AXIS TEST AGAINST DELTA_SET, RUN BY MAPPING THE REAL FIELDS ─────────────────────────
 *
 * `DELTA_SET` was the candidate, and the argument for minting rather than reusing was that the
 * axis is inverted: DELTA_SET is N METRICS with one comparison; this is one METRIC across N
 * ENTITIES. That is an abstraction, so it was tested by attempting the mapping against the
 * producer's actual rows. It fails in four concrete places:
 *
 *   1. `share_of_total` HAS NO SLOT — and it is the field that answers the question. "Which
 *      accounts are driving this variance" is answered by the share, not by the amount; a
 *      $400K contributor is a different fact at 8% of the total than at 80%.
 *   2. `affected[]` would be PERMANENTLY EMPTY. A driver row names one entity and affects
 *      nothing else. A required field with nothing to put in it is the declared-but-unwired
 *      shape, manufactured on purpose.
 *   3. `metric` would carry an ENTITY NAME. A field meaning the opposite of its name is the
 *      borrowed-name defect ShortfallGrid's contract already refuses in the other direction.
 *   4. ORDER IS THE ANSWER here and is not part of DELTA_SET's contract at all — it groups by
 *      direction, which deliberately discards ordering.
 *
 * Also disqualifying, and independently: `INSTANCES_BY_PROPERTY` — the archetype ADR-0045
 * originally assigned — is a filtered instance table fed by a hand-set BFF feeder, absent from
 * the projection arm, and requires target/columns/row_identity/state_vocabulary that a ranking
 * has none of. The neighbouring comment in that feeder warns against copying it.
 *
 * ── THE CELL VOCABULARY IS REUSED EVEN THOUGH THE ARCHETYPE IS NOT ─────────────────────────
 *
 * `favourable` maps onto DELTA_SET's `improved | degraded` reading, and the same tones are used
 * for it. So the two cards read as one system without pretending to be one shape — which is the
 * distinction between sharing a language and sharing a container.
 */

export const CONTRIBUTION_RANKING_ROW_REQUIREMENTS = {
  minRows: 1,
  /**
   * ORDER IS THE PRODUCER'S. It ranks by contribution and this renders that order verbatim.
   * Re-sorting here would be a second implementation of the ranking, and the two would
   * disagree the first time the producer changed its tie-break.
   */
  orderIsUpstream: true,
  /**
   * `share_of_total` is COMPUTED UPSTREAM and is NULLABLE. Null means the total was zero —
   * there is no share of nothing — and it renders as absent, never as 0%.
   */
  shareIsUpstreamAndNullable: true,
} as const;

export const CONTRIBUTION_RANKING_REFUSAL_REASONS = [
  "no contributors recorded",
  "contributor is missing its name",
  "contributor carries no contribution",
] as const;

export const CONTRIBUTION_RANKING_CONTRACT = {
  archetype: "CONTRIBUTION_RANKING",
  component: "ContributionRanking",
  layout: "full-width",
  /** ADR-0042 Ruling 9's discriminant: a ranking of contributions moves as the facts move. */
  recomputes: true,
  fields: {
    /**
     * Rows: entity_id, entity_name, contribution, share_of_total, favourable, plus whatever
     * quantities the producer chose to carry (bcws/bcwp/acwp) and an optional `note`.
     */
    rows: { encoding: "array", parsesTo: "array-of-objects", required: true },
    /** What is being contributed TO. Supplied; the renderer invents no framing. */
    value_label: { type: "string", required: false },
    value_unit: { type: "string", required: false },
    scope_label: { type: "string", required: false },
  },
  rowRequirements: CONTRIBUTION_RANKING_ROW_REQUIREMENTS,
  refusalReasons: CONTRIBUTION_RANKING_REFUSAL_REASONS,
} as const;

export type ContributionRankingContract = typeof CONTRIBUTION_RANKING_CONTRACT;
export type ContributionRankingRefusal =
  (typeof CONTRIBUTION_RANKING_REFUSAL_REASONS)[number];

export interface ContributionRow {
  entity_id: string;
  entity_name: string;
  /** Signed. The sign's MEANING is `favourable`, which the producer states rather than us. */
  contribution: number;
  /** NULL when the total was zero. Absent is not 0% — see the row requirements. */
  share_of_total?: number | null;
  /**
   * The producer's verdict on the sign, and it must not be inferred. In cost variance a
   * positive number is favourable; in other measures the same sign is not. A renderer deciding
   * from `contribution > 0` would be right on this payload and wrong on the next one.
   */
  favourable?: boolean;
  variance_kind?: string;
  bcws?: number;
  bcwp?: number;
  acwp?: number;
  /**
   * A caveat the producer attaches to THIS row — e.g. that a level-of-effort account's
   * schedule variance is structurally zero and carries no information about progress. Rendered
   * where it belongs, on its row, because a caveat shown elsewhere is a caveat nobody reads.
   */
  note?: string;
}

export function validateContributionRanking(
  rows: unknown,
):
  | { kind: "ok"; rows: ContributionRow[] }
  | { kind: "empty"; reason: ContributionRankingRefusal } {
  if (!Array.isArray(rows) || rows.length < CONTRIBUTION_RANKING_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no contributors recorded" };
  }
  const objs = rows.filter(
    (r): r is Record<string, unknown> => typeof r === "object" && r !== null && !Array.isArray(r),
  );
  if (objs.length !== rows.length) {
    return { kind: "empty", reason: "contributor is missing its name" };
  }
  if (objs.some((r) => typeof r.entity_name !== "string" || !r.entity_name)) {
    return { kind: "empty", reason: "contributor is missing its name" };
  }
  if (objs.some((r) => typeof r.contribution !== "number" || !Number.isFinite(r.contribution))) {
    return { kind: "empty", reason: "contributor carries no contribution" };
  }
  return { kind: "ok", rows: objs as unknown as ContributionRow[] };
}
