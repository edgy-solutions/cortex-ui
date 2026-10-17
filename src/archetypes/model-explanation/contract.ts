/**
 * MODEL_EXPLANATION — cortex-proposed; no producer serves this.
 *
 * ADR-0057 (invincible-agent, Proposed — "nothing is built yet") names `mesh:explainModel`:
 * "what the ratified model says about a class or property, and why". No producer route serves it
 * and no wire shape exists anywhere. This is the cortex-PROPOSED read side, same situation as
 * `src/archetypes/illustration/`. The nearest real producer is the ontology service's
 * `POST /classes`, which returns per class `{uri, label, definition, example}` and nothing that
 * answers ADR-0057 §2's eight questions.
 *
 * This is explainModel's RESULT, distinct from the diffModel shape proposed in the 10-15 packet
 * (sessions/2026-10-15-packet-to-lane-74-and-lane-1-adr-0057-model-canvas-design-and-wire-ask.md),
 * which plans MODEL_PROPOSAL / MODEL_CLASS / MODEL_QUESTIONS. It shares that packet's question
 * keys and states ON PURPOSE, so the producer is asked for one vocabulary, not two.
 *
 * EVERYTHING here — the payload shape and every fixture — is cortex-proposed and HAND-BUILT.
 * The day a producer serves this, this file is the one place that gets corrected to match it.
 */

export const MODEL_QUESTIONS = [
  "identity",
  "system_of_record",
  "owning_domain",
  "consuming_domains",
  "cardinality",
  "history_vs_property",
  "lifecycle",
  "reuse",
] as const;
export type ModelQuestion = (typeof MODEL_QUESTIONS)[number];

/** Human labels, ADR-0057 §2's words. */
export const MODEL_QUESTION_LABEL: Record<ModelQuestion, string> = {
  identity: "Identity — what makes an instance unique",
  system_of_record: "System of record — where the authoritative copy lives",
  owning_domain: "Owning domain",
  consuming_domains: "Consuming domains",
  cardinality: "Cardinality",
  history_vs_property: "History or property — a dated new fact, or an overwrite",
  lifecycle: "Lifecycle",
  reuse: "Reuse — does a vendored ontology already have it",
};

export type ModelAnswer =
  | { state: "answered"; value: string | string[]; source?: string | null }
  | { state: "deferred"; reason: string }
  | { state: "not_recorded" };

export interface ModelTerm {
  iri: string;
  label?: string | null;
}
export interface ModelProperty extends ModelTerm {
  range?: string | null;
  /** null/absent = the model states no lower bound — never read as 0. */
  min?: number | null;
  /** null/absent = the model states no upper bound; only an explicit "unbounded" is `*`. */
  max?: number | "unbounded" | null;
}
export interface ModelExplanation {
  subject: { kind: string; iri: string; label?: string | null; definition?: string | null };
  /** Which ratified model answered: the sha of the TTL/SHACL it was read from (ADR §5). */
  ratified_at?: string | null;
  super_classes?: ModelTerm[] | null;
  /** Class subjects only. */
  properties?: ModelProperty[] | null;
  /** All eight MODEL_QUESTIONS keys, always; a missing key is unreadable. */
  answers?: Record<string, unknown> | null;
}

export const MODEL_EXPLANATION_CONTRACT = {
  archetype: "MODEL_EXPLANATION",
  component: "ModelExplanation",
  // No row space, grid-cell constraint or chart x-axis argument applies — a read-only viewer
  // card, same non-applicability as ILLUSTRATION's own comment. "full-width" because the
  // question table wants the row on a narrow viewport.
  layout: "full-width",
  // FALSE: the card is a pure function of the payload; nothing moves under it.
  recomputes: false,
  fields: {
    model_explanation: { encoding: "object", parsesTo: "object", required: true },
  },
} as const;

export type ModelExplanationContract = typeof MODEL_EXPLANATION_CONTRACT;
