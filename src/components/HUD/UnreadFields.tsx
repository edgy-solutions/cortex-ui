import { useCurrentArtifact } from "@/store/useCanvasStore";
import { unconsumedFields } from "@/lib/unconsumedFields";

/**
 * UnreadFields — the keys this answer's payload carried that no archetype read.
 *
 * R-075 rules that an enumeration inside a message string is a field. That catches the PRODUCER.
 * This catches the other end: a correct field, emitted by someone who did the right thing, that
 * no consumer was ever written for. Nothing fails, so nothing surfaces it.
 *
 * `available` — the values a refused slot WILL accept — was exactly that. A field on the cost
 * engine's refusal with zero readers in the dispatch chain and zero in the presentation agent,
 * while the card rendered the refusal as prose. Establishing why took a four-hop source trace
 * across two repos. With this panel it would have been one line on screen.
 *
 * ⛔ IT REPORTS, IT NEVER RENDERS. Names only, never values — see `unconsumedFields`, whose
 * report type has nowhere to put a value. A key here is a FINDING: something arrived that this
 * UI has no treatment for, and the reader is entitled to know it arrived. What is IN it is a
 * different question and not this panel's to answer.
 *
 * DETAILED MODE ONLY, mounted by `HUD.tsx`. It is an instrument, not part of the answer.
 */
export function UnreadFields() {
  const artifact = useCurrentArtifact();
  const components = artifact?.rendered_output?.components;
  if (!Array.isArray(components) || components.length === 0) return null;

  const reports = components.map(unconsumedFields);
  const unread = reports.filter((r): r is Extract<typeof r, { status: "unread" }> =>
    r.status === "unread",
  );
  // An archetype with no contract in this repo cannot be measured. Counted and named rather
  // than hidden, because "nothing unread" and "nothing measurable" are different facts and the
  // second one silently makes this panel useless.
  const unmeasured = reports.filter((r) => r.status === "no_declaration").length;

  if (unread.length === 0 && unmeasured === 0) return null;

  return (
    <div className="glass-panel-sm p-3" data-unread-fields>
      <div className="text-[9px] font-mono uppercase tracking-wider text-amber-500/70 mb-1">
        payload keys nothing read
      </div>
      {unread.map((r, i) => (
        <div
          key={`${r.archetype}-${i}`}
          className="text-[10px] font-mono leading-snug text-slate-400"
          data-unread-archetype={r.archetype}
          /* Both facts on the ROW, so one element answers "which archetype, which keys" — a
             reader (or a test) should not have to descend into a span to find half of it. */
          data-unread-keys={r.keys.join(",")}
        >
          <span className="text-slate-300">{r.archetype}</span>
          <span className="text-slate-500"> carried </span>
          {/* NAMES. Not values — see the header. */}
          <span className="text-amber-400/90">
            {r.keys.join(", ")}
          </span>
          <span className="text-slate-500">, which no archetype declares</span>
        </div>
      ))}
      {unmeasured > 0 && (
        /* NOT a finding about the payload — a gap in this repo's own declarations, which is why
           it reads differently. Without it, a board of undeclared archetypes would render an
           empty panel that looks like a clean result. */
        <div className="mt-1 text-[9px] font-mono text-slate-500" data-unread-unmeasured={unmeasured}>
          {unmeasured} component{unmeasured === 1 ? "" : "s"} could not be checked — no contract
          declared in this UI for {unmeasured === 1 ? "its" : "their"} archetype
        </div>
      )}
    </div>
  );
}
