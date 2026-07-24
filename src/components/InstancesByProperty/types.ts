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

export interface InstancesByPropertyPayload {
  archetype: "INSTANCES_BY_PROPERTY";
  title: string;
  target?: IbpTarget;
  columns: IbpColumn[];
  row_identity?: IbpRowIdentity;
  /** The filter property's value set — rendered as tabs; the active one is
   *  target.filter_value. Enumerated by the feeder; ontology-derived later. */
  state_vocabulary?: string[];
  /** The data. Keys match columns[].key. Always data (from /instances tomorrow,
   *  the hand-assembled feeder today). Values are strings/IRIs. */
  rows: Record<string, string>[];
}
