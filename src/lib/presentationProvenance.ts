/**
 * WHY THIS CARD AND NOT ANOTHER — the selector's own account of how it chose.
 *
 * ── THE QUESTION IT ANSWERS, WHICH NOTHING ELSE CAN ───────────────────────────────────────
 *
 * Two answers from the same verb and the same declared output drew different cards. That is
 * either a legitimate shape difference — the payloads genuinely differ and the selector picked
 * correctly for each — or the selector fell through and landed on a wrong-but-plausible card.
 * NO NUMBER OF EXAMPLES DISTINGUISHES THOSE. Both produce a reasonable-looking card, and
 * counting how often each archetype appears measures the outcome, not the cause.
 *
 * `selection_basis` is the discriminator and it is a single field:
 *
 *   "output_uri+payload"  — the answer's declared type matched a registered capability. The
 *                           caller NAMED this archetype for this output type.
 *   "payload-only (…)"    — output_uri matched NOTHING, so the search widened and some card's
 *                           contract happened to be satisfied by the data.
 *
 * The second is how `mesh:PeriodCostSeries` became a bar chart: it matched no capability, the
 * search widened, a `[{period, total}]` series satisfied CHART_WIDGET, and the answer rendered
 * with `presentation_source: "registered"` — correct-looking, and wrong. This repo already
 * records that incident in `assembleCapabilities.ts`, with the line that matters:
 * "`selection_basis` was the only field that said so."
 *
 * ── ONE KNOWN-GOOD VALUE, NOT AN ENUM OF FAILURES ─────────────────────────────────────────
 *
 * Exactly one basis means "the caller declared this archetype for this type". Everything else —
 * a widening today, a basis nobody has written yet tomorrow — is NOT that, and is treated as
 * worth a reader's attention. The strings themselves are rendered verbatim, because a lookup
 * table of failure modes would render the next basis as an unknown token, which is the
 * silent-fall-through defect wearing a switch statement.
 */

/** The one basis that means the caller named this archetype for this output type. */
export const DECLARED_BASIS = "output_uri+payload";

export interface PresentationProvenance {
  /** `registered` | `default-menu` | `unrenderable` — the producer's word, verbatim. */
  source: string;
  /** How the archetype was reached. See `DECLARED_BASIS`. */
  basis: string;
  /** True only for the basis that means the caller declared this archetype for this type. */
  declared: boolean;
  /** How many capabilities were in the running, and how many the payload actually satisfied. */
  considered: number | null;
  satisfied: number | null;
  /** Cards that could NOT draw this answer, with the requirement each one missed. */
  refusals: { archetype: string; reason: string }[];
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/**
 * Read the selector's provenance, or nothing.
 *
 * ABSENCE IS SILENT AND WILL BE THE COMMON CASE FOR A WHILE. The selector computes all of this
 * per answer and currently hands it to a `logger.info` — it is on a pod's stdout, not on the
 * artifact. Until it is carried, this returns null and the surface draws nothing, because a
 * panel reporting "basis: unknown" would be a measurement nobody took.
 *
 * A record with no BASIS is dropped whole. The other fields are colour; the basis is the claim,
 * and provenance that cannot say how it chose is not provenance.
 */
export function readPresentation(raw: unknown): PresentationProvenance | null {
  if (!isRecord(raw)) return null;
  const basis = str(raw.selection_basis);
  if (!basis) return null;

  const refusals: { archetype: string; reason: string }[] = [];
  if (Array.isArray(raw.refusals)) {
    for (const r of raw.refusals) {
      if (!isRecord(r)) continue;
      const archetype = str(r.archetype);
      const reason = str(r.reason);
      // Same rule the eligibility trace follows: a refusal that names nothing, or declines to
      // explain itself, is a blank pretending to be a report.
      if (!archetype || !reason) continue;
      refusals.push({ archetype, reason });
    }
  }

  return {
    source: str(raw.presentation_source),
    basis,
    declared: basis === DECLARED_BASIS,
    considered: num(raw.candidates_considered),
    satisfied: num(raw.candidates_satisfied),
    refusals,
  };
}
