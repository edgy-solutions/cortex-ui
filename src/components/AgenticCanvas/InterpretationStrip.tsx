import type { Artifact } from "@/api/types";

/**
 * The card's interpretation strip and freshness stamp — the two pieces of vocabulary a live
 * view owes its reader.
 *
 * **Freshness is a ruling, not a decoration.** ADR-0042 §4: each evaluation carries its own
 * `valid_as_of`, stamped at evaluation, "and the card displays it". The ADR calls this the
 * one place a live view could quietly lie — a card that minted at 09:00, re-evaluated at
 * 11:20, and still showed 09:00 would assert that 11:20's numbers were true at 09:00. The
 * client's half of that ruling is simply to SHOW what the artifact carries, never a mint time
 * it remembers separately; there is deliberately no cached timestamp here to go stale.
 *
 * **Slots are rendered as discrete elements, never as a sentence.** The mockup reads
 * "cost curve · scope portfolio · window FY26 · vs cap $4.0M · edit slots", and the
 * interpretation card is the view-control surface — the slots become editable. Rendering
 * them as one interpolated string would make that a re-layout later instead of a behaviour
 * change; each slot is its own element with its own key so the editable version swaps the
 * element and keeps the composition.
 *
 * **Nothing is invented.** Slots come from `resolved_intent.parameters` and nowhere else. A
 * card whose payload carries no parameters renders no slots rather than a plausible guess —
 * an interpretation strip is a claim about how the question was READ, and a fabricated one is
 * worse than none because it is exactly what a reader would trust.
 */

/**
 * A SLOT THAT WAS RESOLVED MUST SAY SO, AND SAY FROM WHAT.
 *
 * The reader asked in their own words and the system narrowed them to something specific:
 * "Brandon" became site S2, "last quarter" became FY26-Q3. Showing only the resolved value
 * hides that a narrowing happened; showing only the spoken form hides that it succeeded. The
 * disclosure is BOTH, with the resolved value authoritative — which is the mitigation for the
 * whole silent-narrowing class, not a nicety.
 *
 * The shape is the ontology service's, read from its own declaration rather than guessed:
 * `{outcome, spoken, instance_id, instance_label, candidates}`.
 *
 * AN UNRESOLVED REFERENT IS NOT A RESOLVED ONE. When `instance_id` is null the service
 * REMOVED the slot rather than passing the raw string through, precisely so a failure is not
 * indistinguishable from a fill. If such a row ever reaches here it renders the spoken form
 * marked unresolved — never a resolution that did not happen.
 */
function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Formats a slot value without asserting a type the payload never declared. */
function slotValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(slotValue).join(", ");
  if (isRecord(v)) {
    const spoken = typeof v.spoken === "string" ? v.spoken.trim() : "";
    // The resolved side, in order of how much it tells a reader. `value` is not a documented
    // referent field; it is accepted because a resolved PERIOD has no declared shape yet and
    // this is the name it would plausibly arrive under — but it is read, never required.
    const resolved =
      (typeof v.instance_label === "string" && v.instance_label.trim()) ||
      (typeof v.instance_id === "string" && v.instance_id.trim()) ||
      (typeof v.value === "string" && v.value.trim()) ||
      "";
    if (spoken && resolved) return `${spoken} → ${resolved}`;
    if (resolved) return resolved;
    // Spoken with nothing resolved: the narrowing did NOT happen, and the card says which.
    if (spoken) return `${spoken} (unresolved)`;
  }
  // An object with none of those has no agreed one-line rendering; say so rather than print
  // "[object Object]".
  return "…";
}

export function InterpretationStrip({ artifact }: { artifact: Artifact }) {
  const params = artifact.resolved_intent?.parameters;
  const slots = params ? Object.entries(params) : [];
  // The action label is the captured routing decision's, read verbatim — the same
  // never-synthesize rule the answer headline follows.
  const action = artifact.routing?.action?.label ?? null;

  // No captured interpretation → render nothing. An empty strip is honest; a placeholder one
  // would occupy the space where a real claim belongs.
  if (!action && slots.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 flex-wrap px-2 py-1 border-b border-white/5">
      <span className="text-[8px] font-mono uppercase tracking-widest text-slate-600 flex-shrink-0">
        Interpreting as
      </span>
      {action && (
        <span className="text-[9px] font-mono text-neon-cyan/85 truncate max-w-[130px]" title={action}>
          {action}
        </span>
      )}
      {slots.map(([k, v]) => (
        // One element per slot, keyed by slot name: the editable version replaces THIS node
        // and leaves the row's composition untouched.
        <span
          key={k}
          data-slot={k}
          className="text-[9px] font-mono text-slate-400 border border-slate-700/50 rounded px-1 py-px truncate max-w-[130px]"
          title={`${k} = ${slotValue(v)}`}
        >
          <span className="text-slate-600">{k} </span>
          {slotValue(v)}
        </span>
      ))}
    </div>
  );
}

/**
 * The evaluation's own as-of, displayed per ADR-0042 §4.
 *
 * Relative for scanning, absolute on hover for the record. It reads `artifact.valid_as_of`
 * every render rather than caching a formatted string, so a re-evaluation that lands through
 * Electric moves the stamp with it — a cached label is precisely how a live view would come
 * to assert a freshness it no longer has.
 */
export function FreshnessStamp({
  artifact,
  now = Date.now(),
}: {
  artifact: Artifact;
  now?: number;
}) {
  const t = artifact.valid_as_of;
  // A missing or nonsensical as-of is reported as unknown, not as "now" — defaulting to the
  // current time would manufacture the exact freshness claim this stamp exists to make honest.
  if (typeof t !== "number" || !Number.isFinite(t) || t <= 0) {
    return (
      <span className="text-[8px] font-mono text-slate-600" title="No as-of on this artifact">
        as of —
      </span>
    );
  }
  return (
    <span
      className="text-[8px] font-mono text-slate-500 tabular-nums"
      title={`Evaluated ${new Date(t).toLocaleString()}`}
    >
      as of {relativeAge(t, now)}
    </span>
  );
}

/** "just now" / "4m" / "2h" / "3d". Compact enough for a card header, exact on hover. */
export function relativeAge(t: number, now: number): string {
  const s = Math.floor((now - t) / 1000);
  if (s < 0) return "just now"; // clock skew: never render a future age
  if (s < 45) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
