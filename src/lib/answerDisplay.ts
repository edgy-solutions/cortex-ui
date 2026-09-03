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
  // The planning + task families. Added 2026-08-25, LATE: the interpreter had been
  // dispatching these for weeks while this union had never heard of them, so every one of
  // them fell through to UNKNOWN and drew a question mark in the answer list.
  //
  // It surfaced the moment routing started working. The cost curves showed a chart glyph
  // because they came back through the DesignUI fallback AS CHART_WIDGET, which this union
  // does know; the gantt was the first answer to arrive through the REGISTERED path carrying
  // its real archetype — and the real archetype was the one the glyph table never learned.
  // The question mark was evidence the routing fix worked.
  | "INTERVAL_TIMELINE"
  | "PERIOD_SERIES"
  | "THRESHOLD_GRID"
  | "MATRIX_GRID"
  | "SHORTFALL_GRID"
  | "ELICITATION"
  | "MULTI_SERIES"
  | "VARIANCE_TREE"
  | "CONTRIBUTION_RANKING"
  | "FORECAST_MEASURE"
  | "DELTA_SET"
  | "DECISION_RECORD"
  | "INSTANCES_BY_PROPERTY"
  | "WORKFLOW_OBSERVATION"
  | "APPROVAL_TASK"
  | "TRIAGE_TASK"
  | "GROUPED_REVIEW"
  | "UNKNOWN";

/**
 * Every archetype above except UNKNOWN, derived so the glyph and label tables can be checked
 * for completeness against it rather than trusted. UNKNOWN stays reachable on purpose — a
 * genuinely unregistered payload must still render something — but no DISPATCHED archetype
 * may fall into it, which is the drift this list exists to catch.
 */
export const DISPLAY_ARCHETYPES = [
  "KNOWLEDGE_DOCUMENT",
  "CHART_WIDGET",
  "ASSET_STATE_METRIC",
  "PROCESS_TOPOLOGY",
  "HAZARD_DECLARATION",
  "DIGITAL_TWIN_3D",
  "INTERVAL_TIMELINE",
  "PERIOD_SERIES",
  "THRESHOLD_GRID",
  "MATRIX_GRID",
  "SHORTFALL_GRID",
  "ELICITATION",
  "MULTI_SERIES",
  "VARIANCE_TREE",
  "CONTRIBUTION_RANKING",
  "FORECAST_MEASURE",
  "DELTA_SET",
  "DECISION_RECORD",
  "INSTANCES_BY_PROPERTY",
  "WORKFLOW_OBSERVATION",
  "APPROVAL_TASK",
  "TRIAGE_TASK",
  "GROUPED_REVIEW",
] as const satisfies readonly Exclude<AnswerArchetype, "UNKNOWN">[];

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
  // Structural archetypes pass through under their own name — no aliasing, no family
  // collapsing. The chart family above collapses sub-variants because CHART_WIDGET genuinely
  // has them; these do not.
  for (const known of DISPLAY_ARCHETYPES) {
    if (A === known) return known;
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
    case "INTERVAL_TIMELINE":
      return "Timeline";
    case "PERIOD_SERIES":
      return "Series";
    case "THRESHOLD_GRID":
      return "Threshold Grid";
    case "MATRIX_GRID":
      return "Matrix";
    case "SHORTFALL_GRID":
      return "Shortfall";
    case "ELICITATION":
      // NOT an answer word. This row is the system asking, and calling it anything that reads
      // as a result is the mislabel that put it in KNOWLEDGE_DOCUMENT in the first place.
      return "Question";
    case "MULTI_SERIES":
      // NOT "Series" — PERIOD_SERIES already owns that word, and two bands with the same
      // header is the borrowed-name defect at the navigation layer. "Trends" says what makes
      // this one different: several lines together, no cap.
      return "Trends";
    case "VARIANCE_TREE":
      return "Decomposition";
    case "CONTRIBUTION_RANKING":
      return "Ranking";
    case "FORECAST_MEASURE":
      return "Forecast";
    case "DELTA_SET":
      return "Delta";
    case "DECISION_RECORD":
      return "Decision";
    case "INSTANCES_BY_PROPERTY":
      return "Instances";
    case "WORKFLOW_OBSERVATION":
      return "Observation";
    case "APPROVAL_TASK":
      return "Approval";
    case "TRIAGE_TASK":
      return "Triage";
    case "GROUPED_REVIEW":
      return "Review";
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

/** Full-content search text for an answer: the summary + question + topic PLUS
 *  the entire rendered payload (chart data, table rows, document text, facts)
 *  and its sources — so list search finds things that appear INSIDE an answer
 *  (e.g. an email like bob@example.com returned in a table), not just the
 *  headline. Lowercased; JSON-stringifies the components so any field matches.
 *  Compute once per answer and cache (it's a bit heavy) — see AnswersPanel. */
export function answerSearchText(a: Artifact): string {
  const parts: string[] = [answerSummary(a), a.question_text || "", answerTopic(a)];
  const comps = a.rendered_output?.components;
  if (comps) {
    try {
      parts.push(JSON.stringify(comps));
    } catch {
      /* non-serializable — skip */
    }
  }
  const src = (a as { sources?: unknown }).sources;
  if (Array.isArray(src)) {
    for (const s of src) {
      if (s && typeof s === "object") {
        const o = s as Record<string, unknown>;
        parts.push(String(o.label ?? ""), String(o.snippet ?? ""), String(o.uri ?? ""));
      }
    }
  }
  return parts.join(" ").toLowerCase();
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
