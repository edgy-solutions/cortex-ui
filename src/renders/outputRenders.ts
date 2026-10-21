import type { FC } from "react";
import { FailureRecordSetCard } from "./FailureRecordSetCard";
import { RiskAssessmentDraftCard } from "./RiskAssessmentDraftCard";

/**
 * RENDERS KEYED BY `output_uri` (201) — NOT archetype packages, NOT menu archetypes (yet).
 *
 * THE ORDERING TRAP: the producer's `capability_admission.py` refuses any registered archetype
 * not in its `KNOWN_ARCHETYPES` (`docs/runbooks/adding-an-archetype.md` site 1 — "before the
 * frontend registers"). Advertising RISK_ASSESSMENT_DRAFT / FAILURE_RECORD_SET now would get those
 * menu rows refused at the door and both subjects would answer `unrenderable`. So cortex keeps
 * advertising KNOWLEDGE_DOCUMENT for these subjects; the BFF delivers the fenced flat reply (which
 * carries `output_uri`), and cortex draws the typed render from it.
 */
export const OUTPUT_RENDERS: ReadonlyMap<string, FC<{ payload: Record<string, unknown> }>> = new Map([
  ["http://internal/sustainment/safety#RiskAssessmentDraft", RiskAssessmentDraftCard],
  ["http://internal/sustainment/safety#FailureRecordSet", FailureRecordSetCard],
]);

/** Exact string match on the full IRI the engine stamps; no CURIE folding. */
export function outputRenderFor(uri: unknown): FC<{ payload: Record<string, unknown> }> | undefined {
  return typeof uri === "string" ? OUTPUT_RENDERS.get(uri) : undefined;
}
