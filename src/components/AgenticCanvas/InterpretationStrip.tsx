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
 * **Nothing is invented.** Slots come from `resolved_intent` and nowhere else. A card whose
 * payload carries none renders no slots rather than a plausible guess — an interpretation
 * strip is a claim about how the question was READ, and a fabricated one is worse than none
 * because it is exactly what a reader would trust.
 *
 * **AND FOR A LONG TIME IT INVENTED NOTHING BY RENDERING NOTHING.** This read
 * `resolved_intent.parameters`, a key no writer in the engine produces — not the initial write
 * from `intent_extraction` (`mode`, `entity_refs`, `slots`) and not the `subtask_slots_decision`
 * overwrite (`accepted_slots`, `refused_slots`, `slot_resolution`). So the strip was blank on
 * every card, and a note in `InterpretationStrip.disclosure.test.tsx` explained the blankness
 * with a cause that had since been fixed. That is its own failure shape, worth naming: THE
 * SYMPTOM OUTLIVED THE DIAGNOSIS, so the filed note kept passing its own smell test because
 * the effect never changed.
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

/**
 * WAS IT CHOSEN, OR WAS IT NARROWED? `outcome: "bound"` means the reader picked it off a menu
 * this system drew; every other outcome means the resolver worked on words they typed.
 *
 * THE TWO ARE NOT FOLDED TOGETHER, and the reason is sharper than tidiness: a strip that
 * erased the distinction could not tell a reader whether the resolver was involved at all.
 * A pick still earns its arrow — the label genuinely did become the value — so the mark that
 * separates them has to be quieter than the arrow's presence.
 *
 * THE MARK IS THE QUOTATION. Quoted is the reader's own words; bare is a label this system put
 * in front of them and they clicked. Nothing is added to the row to carry it, and it is the
 * same convention the refused branch already uses for spoken text.
 *
 * THEY CLICKED, THEY DID NOT SPEAK, and that stays legible past this surface: a clicked label
 * arriving somewhere the resolver expects words is the words-in-an-id-slot hole from the other
 * direction, which is a third reason not to collapse `bound` into `exact`.
 */
function isBound(v: unknown): boolean {
  return isRecord(v) && v.outcome === "bound";
}

/** Formats a slot value without asserting a type the payload never declared. */
function slotValue(v: unknown): string {
  if (v === null) return "null";
  if (typeof v === "string") return v;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : String(v);
  if (typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return v.map(slotValue).join(", ");
  if (isRecord(v)) {
    const raw = typeof v.spoken === "string" ? v.spoken.trim() : "";
    // A picked label is shown bare; typed words are shown quoted. See `isBound`.
    const spoken = raw && !isBound(v) ? `"${raw}"` : raw;
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

/**
 * Whether this artifact has an interpretation to show — the strip's own render condition,
 * EXPORTED so a caller sizing the row beside it cannot hold a second opinion.
 *
 * The footer lays out as two columns and caps the question at 55% so the two share the row.
 * With no strip that cap truncated the question into empty space, and the obvious fix —
 * restating "has an action or some slots" at the call site — would be right today and wrong
 * the day this condition changes, with the disagreement showing up as a clipped question
 * nobody would trace back to here.
 */
export function hasInterpretation(artifact: Artifact): boolean {
  return Boolean(artifact.routing?.action?.label) || interpretationRows(artifact).length > 0;
}

/**
 * THE ROWS, AND WHAT EACH ONE IS MARKED AS.
 *
 * Rows are the UNION of the three keys, not any one of them, and each key is load-bearing for
 * a different reason:
 *
 * `slot_resolution` is the source of DISCLOSURE — the reader's words and what they were
 * narrowed to. It covers everything the resolver touched.
 *
 * `accepted_slots` decides the TREATMENT. A slot that resolved and was then REFUSED is the
 * single most useful row on the strip: it is the explanation for why the answer did not
 * reflect what the person said. Dropping it would be the omission-leaves-no-trace shape — but
 * rendering it identically to one that was used is WORSE than dropping it, because it claims
 * the system used something it discarded. A presence that misrepresents beats an absence for
 * damage. So refusal is a treatment, never a filter.
 *
 * `refused_slots` names them, as records. It carries slots that never reached the resolver at
 * all, so a refusal cannot be inferred from the other two.
 *
 * AND THE UNION IS WIDER THAN THE RESOLVER'S OWN MAP, deliberately. A slot supplied as a menu
 * PICK goes through `validate_bound_slots`, not the resolution ladder, so it can reach the
 * verb with no `slot_resolution` record at all. Sourcing rows from that map alone would drop
 * it — a slot that was used, shown nowhere, which is the same silent omission one field over.
 */
export interface InterpretationRow {
  slot: string;
  /** The resolution record, when the resolver touched this slot. */
  resolution?: unknown;
  /** What reached the verb, when it did. */
  accepted?: unknown;
  /** Why it did not, when it did not. */
  refusedReason?: string;
  /** The reader's own words, from whichever key carried them. */
  spoken?: string;
  used: boolean;
}

export function interpretationRows(artifact: Artifact): InterpretationRow[] {
  const ri = artifact.resolved_intent;
  const resolution = isRecord(ri?.slot_resolution) ? ri.slot_resolution : {};
  const accepted = isRecord(ri?.accepted_slots) ? ri.accepted_slots : {};
  const refused = Array.isArray(ri?.refused_slots) ? ri.refused_slots : [];

  const refusedBy = new Map<string, { reason?: string; spoken?: string }>();
  for (const r of refused) {
    // A refusal with no name cannot be attributed to a row, and attaching it to an arbitrary
    // one would mark a slot as unused on no evidence. Counted by its absence, not guessed at.
    if (isRecord(r) && typeof r.name === "string" && r.name) {
      refusedBy.set(r.name, {
        reason: typeof r.reason === "string" ? r.reason : undefined,
        spoken: typeof r.spoken === "string" ? r.spoken : undefined,
      });
    }
  }

  // Insertion order, resolution first: the slots with something to disclose lead, and every
  // other key adds only what it alone knows about.
  const names: string[] = [];
  for (const k of [...Object.keys(resolution), ...Object.keys(accepted), ...refusedBy.keys()]) {
    if (!names.includes(k)) names.push(k);
  }

  return names.map((slot) => {
    const rec = resolution[slot];
    const ref = refusedBy.get(slot);
    const spokenFromRec =
      isRecord(rec) && typeof rec.spoken === "string" && rec.spoken.trim() ? rec.spoken.trim() : "";
    return {
      slot,
      resolution: rec,
      accepted: Object.prototype.hasOwnProperty.call(accepted, slot) ? accepted[slot] : undefined,
      refusedReason: ref?.reason,
      spoken: spokenFromRec || ref?.spoken || undefined,
      // USED means it reached the verb. A refusal is decisive even if the slot also appears in
      // `accepted_slots`: the two disagreeing is a producer bug, and the safe reading of a
      // disagreement is the one that does not claim a discarded value was acted on.
      used: !refusedBy.has(slot) && Object.prototype.hasOwnProperty.call(accepted, slot),
    };
  });
}

export function InterpretationStrip({ artifact }: { artifact: Artifact }) {
  const slots = interpretationRows(artifact);
  // The action label is the captured routing decision's, read verbatim — the same
  // never-synthesize rule the answer headline follows.
  const action = artifact.routing?.action?.label ?? null;

  // No captured interpretation → render nothing. An empty strip is honest; a placeholder one
  // would occupy the space where a real claim belongs. The predicate is shared with the
  // footer that sizes itself around this decision.
  if (!hasInterpretation(artifact)) return null;

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
      {slots.map((row) => (
        // One element per slot, keyed by slot name: the editable version replaces THIS node
        // and leaves the row's composition untouched.
        <span
          key={row.slot}
          data-slot={row.slot}
          data-slot-refused={row.used ? undefined : ""}
          // The producer's own outcome token, verbatim and uninterpreted. `bound` is a PICK and
          // everything else is a resolution; this surface has no vocabulary of outcomes and must
          // not acquire one, or the next outcome anyone adds renders as a guess.
          data-slot-outcome={
            isRecord(row.resolution) && typeof row.resolution.outcome === "string"
              ? row.resolution.outcome
              : undefined
          }
          className={
            row.used
              ? "text-[9px] font-mono text-slate-400 border border-slate-700/50 rounded px-1 py-px truncate max-w-[130px]"
              : // NOT A DIMMER VERSION OF THE SAME THING. A refused slot that differs only in
                // opacity reads as a quieter fact of the same kind, and the reader's eye
                // resolves it as "used, less important". The dashed border makes it a
                // different KIND of element at a glance, and it is hue-independent — the word
                // below is what actually carries the meaning.
                "text-[9px] font-mono text-amber-300/70 border border-dashed border-amber-500/40 rounded px-1 py-px truncate max-w-[180px]"
          }
          title={
            row.used
              ? `${row.slot} = ${slotValue(row.resolution ?? row.accepted)}${
                  isBound(row.resolution)
                    ? " — chosen from the menu"
                    : isRecord(row.resolution)
                      ? " — resolved from what you said"
                      : ""
                }`
              : `${row.slot}: not used${row.refusedReason ? ` — ${row.refusedReason}` : ""}${
                  row.spoken ? ` (you said "${row.spoken}")` : ""
                }`
          }
        >
          <span className={row.used ? "text-slate-600" : "text-amber-500/60"}>{row.slot} </span>
          {row.used ? (
            slotValue(row.resolution ?? row.accepted)
          ) : (
            <>
              {/* THE WORDS, KEPT. Whatever else a refusal is, the reader said something, and
                  the row exists to explain why the answer does not reflect it. */}
              {row.spoken ? `"${row.spoken}" ` : ""}
              {/* NO ARROW, and this is the deliberate part. `spoken → resolved` asserts that
                  the words BECAME the value the system used. For a refused slot they did not,
                  however well they resolved — so the glyph that means "became" is absent and a
                  WORD says what happened instead. Colour is the second channel, never the
                  only one. */}
              <span className="uppercase tracking-wider">not used</span>
              {row.refusedReason ? (
                // The producer's own reason token, verbatim. It arrives as a record field now
                // rather than inside a sentence, so nothing here parses prose to find it.
                <span className="text-amber-500/70" data-refused-reason={row.refusedReason}>
                  {" · "}
                  {row.refusedReason}
                </span>
              ) : null}
            </>
          )}
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
