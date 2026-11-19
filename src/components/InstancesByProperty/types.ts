/**
 * INSTANCES_BY_PROPERTY payload — a GENERIC "table of instances of a class,
 * filtered by one property" archetype. The PCN "parts by disposition state"
 * dashboard is its FIRST instance, not a feature: everything domain-specific
 * lives in the payload VALUES (columns, rows, vocabulary), never in the widget.
 *
 * Hand-written locally (the GROUPED_REVIEW / WORKFLOW_OBSERVATION precedent —
 * see ../GroupedReview/types.ts) until the contract lands in
 * @platform/iagent-contracts; move it there when it does. Mirrors the schema at
 * invincible-agent/docs/plans/pcn-dashboard-payload-schema.md — each field is
 * the hand-assembled projection of a `rendersAs` triple M3 will declare.
 */

/** One table column: maps a payload row key to a display header. `from` records
 *  the source property (a future rendersAs binding); the widget ignores it. */
export interface IbpColumn {
  key: string;
  label: string;
  from?: string;
}

/** Which column is the stable row key. If `iri`, the cell value is an IRI;
 *  `display_from_local_name` shows its last path/hash segment while identity
 *  stays the full IRI (title/selection). Purely presentational — no domain. */
export interface IbpRowIdentity {
  key: string;
  iri?: boolean;
  display_from_local_name?: boolean;
}

/** What was queried — the future generic /instances params. Display + the
 *  active-filter highlight only; the widget never interprets the values. */
export interface IbpTarget {
  domain?: string;
  class?: string;
  filter_property?: string;
  filter_value?: string;
}

/** One cell as the wire carries it: a typed value. `null` (or a missing key) is ABSENT, which is
 *  not 0 and not "": the widget draws it as absent and draws a served 0 as 0. */
export type IbpCell = string | number | null;

/** A map of column key to a producer phrase saying why a cell is absent. Read tolerantly: the wire
 *  may carry anything here, so the reader checks the shape and bounds every phrase. */
export type IbpAbsentReasons = Record<string, unknown>;

/** One row as the wire carries it: cells keyed by column, plus an optional per-row `absent_reason`
 *  map (a key INSIDE the row, never a column). */
export type IbpRow = Record<string, IbpCell | IbpAbsentReasons>;

export interface InstancesByPropertyPayload {
  archetype: "INSTANCES_BY_PROPERTY";
  title: string;
  target?: IbpTarget;
  columns: IbpColumn[];
  row_identity?: IbpRowIdentity;
  /** The filter property's value set — rendered as tabs; the active one is
   *  target.filter_value. Enumerated by the feeder; ontology-derived later. */
  state_vocabulary?: string[];
  /** The column key the rows group by, declared by the producer (an envelope field, so the
   *  projector carries it only because the archetype's passthrough names it). Absent = one
   *  ungrouped table. A key naming no column is drawn ungrouped AND said; never guessed. */
  group_by?: string;
  /** The data. Keys match columns[].key. Always data (from /instances tomorrow,
   *  the hand-assembled feeder today). Values are strings/IRIs, numbers, or null (absent). */
  rows: IbpRow[];
  /** Why a cell is absent, per column: {column key: phrase}. Drawn as served in an absent cell only.
   *  A row's own `absent_reason` wins. A server older than this omits it. Read as unknown. */
  absent_reason?: unknown;
}
