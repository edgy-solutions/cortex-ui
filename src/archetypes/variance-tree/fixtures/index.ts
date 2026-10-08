/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `VARIANCE_TREE`.
 *
 * Extracted from the inline payload literals in `Card.test.tsx` (nothing here is a new payload
 * shape): the payloads the card should DRAW, plus the two refusals the tests already pin.
 *
 * `ABSENCES` is DERIVED, not chosen: every `data-*` attribute NAME in the card's subtree whose
 * presence flips across the parity population (these fixtures plus the renderable captures).
 * `data-variance-node` and `data-depth` flip only because a refusal draws no tree at all; they
 * are kept because the rule is mechanical, and named here so nobody re-reads them as detail.
 * `data-cell-inspector`-style attributes that appear only AFTER a click are excluded
 * (ADR-0055 amendment 2026-09-18 §1).
 */
export const VARIANCE_TREE_ABSENCES = [
  "data-variance-node",
  "data-depth",
  "data-depth-rail",
  "data-share-bar",
  "data-stop-reason",
  "data-residual",
  "data-verdict-tag",
  "data-render-limit",
] as const;

export type VarianceTreeAbsence = (typeof VARIANCE_TREE_ABSENCES)[number];

export interface VarianceTreeFixture {
  name: string;
  rows: unknown;
  envelope: Record<string, unknown>;
  declares: VarianceTreeAbsence[];
}

const leaf = (name: string, variance: number, extra = {}) => ({
  level: "work_package",
  entity_id: name,
  entity_name: name,
  variance,
  share_of_root: variance / 1000,
  stop_reason: "leaf",
  ...extra,
});

/** A tree deeper than the card draws, so the two truncations are both in play. */
const deepTree = () => [
  {
    level: "program",
    entity_id: "P",
    entity_name: "Meridian",
    variance: -1000,
    share_of_root: 1,
    stop_reason: "decomposed",
    bcws: 5000,
    bcwp: 4000,
    acwp: 5000,
    contributors: [
      {
        level: "control_account",
        entity_id: "CA1",
        entity_name: "CA 3.1",
        variance: -700,
        share_of_root: 0.7,
        stop_reason: "decomposed",
        contributors: [
          {
            level: "work_package",
            entity_id: "WP1",
            entity_name: "WP 3.1.1",
            variance: -500,
            share_of_root: 0.5,
            stop_reason: "decomposed",
            contributors: [
              {
                level: "task",
                entity_id: "T1",
                entity_name: "Task A",
                variance: -300,
                share_of_root: 0.3,
                stop_reason: "decomposed",
                contributors: [leaf("Subtask A1", -200)],
              },
            ],
          },
        ],
      },
    ],
  },
];

export const VARIANCE_TREE_FIXTURES: VarianceTreeFixture[] = [
  {
    name: "a lone leaf — nothing beneath it in the model",
    rows: [{ ...leaf("WP", -100), share_of_root: 1 }],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-share-bar", "data-stop-reason"],
  },
  {
    name: "a node the analysis stopped explaining — immaterial",
    rows: [{ ...leaf("CA", -20), stop_reason: "explained", share_of_root: 0.02 }],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-share-bar", "data-stop-reason"],
  },
  {
    name: "a node the analysis stopped at its own depth limit",
    rows: [{ ...leaf("CA", -400), stop_reason: "depth", share_of_root: 0.4 }],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-share-bar", "data-stop-reason"],
  },
  {
    name: "a tree deeper than the card draws, envelope labels sent",
    rows: deepTree(),
    envelope: { value_label: "Cost variance", value_unit: "USD", scope_label: "Notional Program Meridian" },
    declares: ["data-variance-node", "data-depth", "data-depth-rail", "data-share-bar", "data-render-limit"],
  },
  {
    name: "a residual the producer declined to enumerate, with its note",
    rows: [
      {
        ...leaf("P", -1000),
        level: "program",
        stop_reason: "decomposed",
        share_of_root: 1,
        contributors: [leaf("CA1", -700)],
        residual: -300,
        residual_note: "4 contributor(s) below the 5% materiality floor, netting -300 USD",
      },
    ],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-depth-rail", "data-share-bar", "data-stop-reason", "data-residual"],
  },
  {
    name: "a residual with no note — the number alone",
    rows: [
      {
        ...leaf("P", -1000),
        level: "program",
        stop_reason: "decomposed",
        share_of_root: 1,
        contributors: [leaf("CA1", -700)],
        residual: -300,
      },
    ],
    envelope: { value_unit: "USD" },
    declares: ["data-variance-node", "data-depth", "data-depth-rail", "data-share-bar", "data-stop-reason", "data-residual"],
  },
  {
    name: "a node the producer called adverse — the verdict is a word",
    rows: [{ ...leaf("WP", -100), share_of_root: 1, favourable: false }],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-share-bar", "data-stop-reason", "data-verdict-tag"],
  },
  {
    name: "a null share draws no bar",
    rows: [{ ...leaf("WP", -100), share_of_root: null }],
    envelope: {},
    declares: ["data-variance-node", "data-depth", "data-share-bar", "data-stop-reason"],
  },
  {
    name: "refused — a payload with no root",
    rows: [],
    envelope: { scope_label: "Notional Program Meridian" },
    declares: [],
  },
  {
    name: "refused — a root with no variance",
    rows: [{ level: "program", entity_id: "P", entity_name: "P" }],
    envelope: {},
    declares: [],
  },
];
