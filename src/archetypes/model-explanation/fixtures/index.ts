/**
 * DISCRIMINATING FIXTURES — ADR-0055 §2, for `MODEL_EXPLANATION`.
 *
 * HAND-BUILT, as `contract.ts`'s header says: no producer serves `mesh:explainModel` (ADR-0057,
 * Proposed), so there is no capture to load. The IRIs and answers below are ILLUSTRATIVE — plausible
 * IOF/maintenance vocabulary, not a reading of any ratified model.
 */
import type { ModelExplanation } from "../contract";

export const MODEL_EXPLANATION_ABSENCES = [
  'data-model-subject="unknown-kind"',
  'data-model-definition="none"',
  'data-model-ratified="unstated"',
  'data-model-properties="none"',
  'data-model-question="not-recorded"',
  'data-model-question="deferred"',
  'data-model-question="unreadable"',
  'data-model-answer-source="none"',
  'data-model-questions="unknown-keys"',
  'data-model-cardinality="not-stated"',
  'data-model-cardinality="part-stated"',
  'data-model-cardinality="unreadable"',
] as const;

export type ModelExplanationAbsence = (typeof MODEL_EXPLANATION_ABSENCES)[number];

export interface ModelExplanationFixture {
  name: string;
  payload: ModelExplanation;
  declares: ModelExplanationAbsence[];
}

const NS = "https://spec.industrialontologies.org/ontology/maintenance/";
const SHA = "5d8800e0a1b2c3d4e5f60718293a4b5c6d7e8f90";

const ALL_ANSWERED = {
  identity: { state: "answered", value: "Asset tag plus plant code", source: "shape:MaintainableItemShape sh:key" },
  system_of_record: { state: "answered", value: "Maximo", source: "maintenance.ttl rdfs:comment" },
  owning_domain: { state: "answered", value: "Reliability Engineering", source: "maintenance.ttl dct:creator" },
  consuming_domains: {
    state: "answered",
    value: ["Planning", "Procurement"],
    source: "maintenance.ttl cortex:consumedBy",
  },
  cardinality: { state: "answered", value: "One per physical asset", source: "shape:MaintainableItemShape sh:maxCount" },
  history_vs_property: { state: "answered", value: "Dated new fact", source: "maintenance.ttl cortex:temporal" },
  lifecycle: { state: "answered", value: "Commissioned, in service, retired", source: "maintenance.ttl skos:note" },
  reuse: { state: "answered", value: "IOF Core MaintainableItem", source: "vendored iof-core.ttl" },
};

const NOT_RECORDED_ALL = Object.fromEntries(
  Object.keys(ALL_ANSWERED).map((k) => [k, { state: "not_recorded" }]),
);

const EVERY_QUESTION_ANSWERED: ModelExplanation = {
  subject: {
    kind: "class",
    iri: `${NS}MaintainableItem`,
    label: "Maintainable item",
    definition: "An item that can be maintained under a maintenance plan.",
  },
  ratified_at: SHA,
  super_classes: [{ iri: `${NS}Item`, label: "Item" }],
  properties: [
    { iri: `${NS}hasAssetTag`, label: "has asset tag", range: "xsd:string", min: 1, max: 1 },
    { iri: `${NS}hasWorkOrder`, label: "has work order", range: "WorkOrder", min: 0, max: "unbounded" },
  ],
  answers: ALL_ANSWERED,
};

const TODAYS_RATIFIED: ModelExplanation = {
  subject: {
    kind: "class",
    iri: `${NS}FailureMode`,
    label: "Failure mode",
    definition: "The manner in which an item fails.",
  },
  ratified_at: SHA,
  answers: NOT_RECORDED_ALL,
};

const MID_WAY: ModelExplanation = {
  subject: { kind: "class", iri: `${NS}InspectionPlan` },
  super_classes: [],
  properties: [
    { iri: `${NS}hasInterval`, label: "has interval", range: "xsd:duration", min: 1, max: null },
    // "*" is drawn from "unbounded" only; a producer that sends the symbol itself is unreadable.
    { iri: `${NS}supersedes`, label: "supersedes", range: "InspectionPlan", min: 0, max: "*" as unknown as number },
    { iri: `${NS}appliesTo`, range: "MaintainableItem", min: null, max: null },
  ],
  answers: {
    identity: { state: "answered", value: "Plan number" },
    system_of_record: { state: "answered", value: "Maximo", source: "proposal PR-14 description" },
    owning_domain: { state: "deferred", reason: "Waiting on the reliability steward" },
    consuming_domains: { state: "deferred", reason: "  " },
    cardinality: { state: "answered", value: "One active plan per item", source: "proposal PR-14 shape" },
    history_vs_property: { state: "answered", value: "Overwrite", source: "proposal PR-14 description" },
    // lifecycle: deliberately MISSING from the wire.
    reuse: { state: "not_recorded" },
    owner: "Chris",
  },
};

const PROPERTY_SUBJECT: ModelExplanation = {
  subject: {
    kind: "property",
    iri: `${NS}hasAssetTag`,
    label: "has asset tag",
    definition: "The tag that physically identifies the asset.",
  },
  ratified_at: SHA,
  answers: ALL_ANSWERED,
};

const UNKNOWN_KIND: ModelExplanation = {
  subject: {
    kind: "shape",
    iri: `${NS}MaintainableItemShape`,
    label: "Maintainable item shape",
    definition: "SHACL shape constraining maintainable items.",
  },
  ratified_at: SHA,
  answers: NOT_RECORDED_ALL,
};

export const MODEL_EXPLANATION_FIXTURES: ModelExplanationFixture[] = [
  { name: "every question answered, with its source", payload: EVERY_QUESTION_ANSWERED, declares: [] },
  {
    name: "today's ratified model: a class with nothing recorded",
    payload: TODAYS_RATIFIED,
    declares: ['data-model-question="not-recorded"', 'data-model-properties="none"'],
  },
  {
    name: "a proposal mid-way: deferrals, an unreadable deferral, a missing key, an unknown key",
    payload: MID_WAY,
    declares: [
      'data-model-definition="none"',
      'data-model-ratified="unstated"',
      'data-model-question="not-recorded"',
      'data-model-question="deferred"',
      'data-model-question="unreadable"',
      'data-model-answer-source="none"',
      'data-model-questions="unknown-keys"',
      'data-model-cardinality="not-stated"',
      'data-model-cardinality="part-stated"',
      'data-model-cardinality="unreadable"',
    ],
  },
  { name: "a property subject", payload: PROPERTY_SUBJECT, declares: [] },
  {
    name: "a subject kind this card does not know",
    payload: UNKNOWN_KIND,
    declares: ['data-model-subject="unknown-kind"', 'data-model-question="not-recorded"'],
  },
];
