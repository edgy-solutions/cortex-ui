import type { Artifact } from "@/api/types";

/**
 * answerDisplay — the ONE place that derives an answer's display facts
 * from an Artifact, so the row and the pinned canvas card agree.
 *
 * Guardrails encoded here (ADR-0028 + the composed-path seal):
 *  - The SUMMARY is read VERBATIM from `artifact.summary` (the captured
 *    S·P headline the projector delivered — proven live). It is NEVER
 *    re-composed on the read side; if empty (legacy/thin row) we fall
 *    back to `question_text` for the label only — we do NOT synthesize a
 *    headline (that would be the synthesis-is-theater re-derivation the
 *    whole chain was built to avoid).
 *  - The TYPE is the real BAML `SemanticArchetype` (KNOWLEDGE_DOCUMENT,
 *    CHART_WIDGET, ASSET_STATE_METRIC, PROCESS_TOPOLOGY, HAZARD_
 *    DECLARATION, DIGITAL_TWIN_3D), NOT the mock's invented doc/dash.
 *  - FALLBACK is an ORTHOGONAL boolean overlay (`routing.fallback`), not
 *    a type — it rides on any archetype.
 *  - The card carries its SPO PROVENANCE (subject, subject-type, verb)
 *    even though v1 doesn't compute over it (the forward-compat
 *    constraint so v2/v3 compute without re-derivation).
 */

/** The real answer-type vocabulary (BAML SemanticArchetype). Chart/table
 *  sub-variants collapse onto their family for the glyph. */
export type AnswerArchetype =
  | "KNOWLEDGE_DOCUMENT"
  | "CHART_WIDGET"
  | "ASSET_STATE_METRIC"
  | "PROCESS_TOPOLOGY"
  | "HAZARD_DECLARATION"
  | "DIGITAL_TWIN_3D"
  | "UNKNOWN";

/** SPO provenance the card carries forward (ADR-0028 Decision 2). */
export interface AnswerSPO {
  /** Display subject: the INSTANCE label when resolved, else the class. */
  subjectLabel: string | null;
  /** The subject CLASS label (the type) — always the class, kept for
   *  eligibility computation in v2/v3 even when subjectLabel is an instance. */
  subjectClassLabel: string | null;
  subjectUri: string | null;
  verbLabel: string | null;
  verbIri: string | null;
}

/** The row/card's lead line: the captured S·P headline, read verbatim.
 *  Empty summary → fall back to question_text for the LABEL only (never a
 *  synthesized headline). */
export function answerSummary(a: Artifact): string {
  const s = (a.summary || "").trim();
  if (s) return s;
  return (a.question_text || "").trim() || "(untitled answer)";
}

/** True iff `summary` actually carried a captured headline (vs the
 *  question-text fallback). Lets the row dim the fallback-to-question. */
export function hasCapturedSummary(a: Artifact): boolean {
  return Boolean((a.summary || "").trim());
}

/** Pull the real SemanticArchetype from rendered_output. Deterministic,
 *  no synthesis. Collapses chart/table sub-variants onto their family. */
export function answerArchetype(a: Artifact): AnswerArchetype {
  const ro = a.rendered_output;
  let raw: string | null = null;
  if (ro) {
    if (typeof ro.archetype === "string" && ro.archetype) {
      raw = ro.archetype;
    } else {
      const first = ro.components?.[0];
      if (first && typeof first === "object" && "archetype" in first) {
        const v = (first as { archetype?: unknown }).archetype;
        if (typeof v === "string" && v) raw = v;
      }
    }
  }
  if (!raw) return "UNKNOWN";
  const A = raw.toUpperCase();
  if (A === "KNOWLEDGE_DOCUMENT") return "KNOWLEDGE_DOCUMENT";
  if (A === "PROCESS_TOPOLOGY") return "PROCESS_TOPOLOGY";
  if (A === "HAZARD_DECLARATION") return "HAZARD_DECLARATION";
  if (A === "DIGITAL_TWIN_3D") return "DIGITAL_TWIN_3D";
  if (A === "ASSET_STATE_METRIC" || A === "METRIC") return "ASSET_STATE_METRIC";
  if (
    A === "CHART_WIDGET" ||
    A === "CHART" ||
    A.endsWith("_CHART") ||
    A === "TABLE" ||
    A === "ROW_TABLE" ||
    A === "SCATTER"
  ) {
    return "CHART_WIDGET";
  }
  return "UNKNOWN";
}

/** Short human label for an archetype (for the TYPE-group header + a11y). */
export function archetypeLabel(t: AnswerArchetype): string {
  switch (t) {
    case "KNOWLEDGE_DOCUMENT":
      return "Knowledge Doc";
    case "CHART_WIDGET":
      return "Chart";
    case "ASSET_STATE_METRIC":
      return "Metric";
    case "PROCESS_TOPOLOGY":
      return "Topology";
    case "HAZARD_DECLARATION":
      return "Hazard";
    case "DIGITAL_TWIN_3D":
      return "Digital Twin";
    default:
      return "Answer";
  }
}

/** The dead-end discriminator: no direct route matched. This is the
 *  BEST-AVAILABLE structural signal — there is no field that expresses
 *  "produced a usable answer" (status/rendered_output/component-count all
 *  look complete even for dead-ends; content-length conflates "no answer"
 *  with "non-text answer"). fallback's imperfection is harmless because
 *  the treatment is COLLAPSE-WITH-COUNT, not drop: a rare generalist-that-
 *  answered lands in the collapsed "unresolved" group, still present and
 *  one expand away, never disappeared. */
export function isUnresolved(a: Artifact): boolean {
  return a.routing?.fallback === true;
}

/** TOPIC-grouping key: the subject class the answer is about. Fallback
 *  answers have no grounded subject → "unresolved" (they land in the
 *  collapsed group regardless). */
export function answerTopic(a: Artifact): string {
  if (isUnresolved(a)) return "unresolved";
  const label = a.routing?.about?.label?.trim();
  return label || "ungrouped";
}

/** The SPO provenance the card carries forward for v2/v3. `subjectLabel`
 *  prefers the resolved INSTANCE label ("Customer 360") over the class
 *  label ("Dashboard") — the specific thing the eye hunts for — falling
 *  back to the class for set/type-level queries. `subjectClassLabel`
 *  keeps the class available (the type is still carried for eligibility
 *  computation in v2/v3). */
export function answerSPO(a: Artifact): AnswerSPO {
  const about = a.routing?.about;
  const action = a.routing?.action;
  const instance = about?.instance_label?.trim() || null;
  const klass = about?.label?.trim() || null;
  return {
    subjectLabel: instance || klass,
    subjectClassLabel: klass,
    subjectUri: about?.uri || null,
    verbLabel: action?.label?.trim() || null,
    verbIri: action?.iri || null,
  };
}
