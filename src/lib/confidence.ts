/**
 * Honest confidence presentation per architect's ruling 2026-06-21:
 *
 *   "Show the real confidence bucket including low. Pair low confidence
 *   with what to do about it. Never hide or relabel it 'exploratory' —
 *   that's manufacturing confidence the pipeline did not have."
 *
 * The bucket is a FAITHFUL projection of the float, not a euphemism.
 * The raw float is preserved (the UI shows it on hover for power users).
 * Failure-demo discipline holds at the UI layer: the system honestly
 * saying "I'm unsure" is exactly the trust signal we want to surface,
 * not hide.
 */

export type ConfidenceBucket = "high" | "medium" | "low" | "very_low";

export interface ConfidencePresentation {
  bucket: ConfidenceBucket;
  /** Bucket name as it appears to the user — no euphemism. */
  label: string;
  /** Tailwind color class for the bar fill. Tracks the bucket. */
  colorClass: string;
  /** Width percent for the bar — derived from the raw float, NOT the
   *  bucket, so two 0.62 scores look identical even if one straddles
   *  a bucket boundary. */
  widthPct: number;
  /** Raw float, preserved for hover/tooltip auditability. */
  raw: number;
  /** Optional one-line nudge the user can act on. Only present for
   *  low / very_low buckets — the architect's "pair with what to do
   *  about it" detail. Higher buckets get null (no nudge needed). */
  nudge: string | null;
}

const BUCKETS: ReadonlyArray<{
  min: number;
  bucket: ConfidenceBucket;
  label: string;
  colorClass: string;
  nudge: string | null;
}> = [
  {
    min: 0.85,
    bucket: "high",
    label: "high confidence",
    colorClass: "bg-neon-green",
    nudge: null,
  },
  {
    min: 0.6,
    bucket: "medium",
    label: "medium confidence",
    colorClass: "bg-neon-cyan",
    nudge: null,
  },
  {
    min: 0.35,
    bucket: "low",
    label: "low confidence",
    colorClass: "bg-amber-400",
    // The actionable nudge — architect's required pairing for low buckets.
    // Phrased as a suggestion to the user, not an apology from the system.
    nudge: "The system wasn't sure this is the right match. Rephrasing your question with more specific terms may help.",
  },
  {
    min: 0,
    bucket: "very_low",
    label: "very low confidence",
    colorClass: "bg-red-400",
    nudge: "The system did not find a confident match for this. Consider rephrasing — or this question may be outside the indexed knowledge.",
  },
];

/**
 * Project a raw 0..1 confidence float to a faithful presentation.
 * Out-of-range values are clamped (not silently zeroed) so a buggy
 * upstream still produces a readable bucket rather than an empty
 * bar — the failure case stays visible.
 */
export function presentConfidence(raw: number | null | undefined): ConfidencePresentation {
  // Treat null/undefined/NaN as a very-low signal — surface as the
  // honest "unknown" rather than fabricating a default. The float is
  // preserved as 0 so the bar renders empty (truthful: "no signal").
  const clamped = Math.max(
    0,
    Math.min(1, typeof raw === "number" && !Number.isNaN(raw) ? raw : 0)
  );
  const match =
    BUCKETS.find((b) => clamped >= b.min) ??
    BUCKETS[BUCKETS.length - 1];
  return {
    bucket: match.bucket,
    label: match.label,
    colorClass: match.colorClass,
    widthPct: Math.round(clamped * 100),
    raw: clamped,
    nudge: match.nudge,
  };
}

/**
 * Compute a brief human-readable verb label from a verb IRI. The
 * gateway's RouteDecision event SHOULD carry a curated label, but
 * this fallback keeps the panel honest if the field is absent —
 * we render the IRI's local name in human-ish form rather than the
 * raw URI (which casual users find alien).
 *
 * NEVER synthesizes meaning that isn't in the IRI. "mesh:retrieveKnowledge"
 * → "Retrieve knowledge"; we don't invent a verb description.
 */
export function fallbackVerbLabel(iri: string | undefined): string {
  if (!iri) return "Unknown action";
  const local = iri.split(/[#/]/).pop() ?? iri;
  // Strip a "mesh:" prefix if the gateway forgot to. Then convert
  // CamelCase → space-separated words.
  const noPrefix = local.replace(/^mesh:/, "");
  const spaced = noPrefix.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

/**
 * Same shape as fallbackVerbLabel but for subject classes. The gateway
 * SHOULD send a curated label; this is the honest fallback.
 */
export function fallbackSubjectLabel(uri: string | undefined): string {
  if (!uri) return "Unknown subject";
  const local = uri.split(/[#/]/).pop() ?? uri;
  const spaced = local.replace(/([a-z])([A-Z])/g, "$1 $2");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
