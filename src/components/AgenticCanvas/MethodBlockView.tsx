import {
  ABSENT_MARK,
  METHOD_ABSENT_SENTENCE,
  NOT_STATED_MARK,
  formatLeaf,
  type ArtifactMethod,
} from "@/lib/cardExport";

/**
 * "HOW THE PRODUCER COMPUTED THIS" — the method block, on the card itself.
 *
 * `CardExportButton.tsx` (retired `dbf67f4`) only ever drew this into the exported HTML, through
 * `methodSection`. Retiring the EXPORT was never an order to retire the READER — most of a
 * method block's value is in being checked at the moment someone is looking at the figure, not
 * three clicks later in a downloaded file — so this is the same three-state account
 * (`readArtifactMethod`, `MethodBlock`, the shared constants below), redrawn as JSX for the card.
 *
 * ── THREE STATES, NOT TWO ──────────────────────────────────────────────────────────────────
 *
 * `ArtifactMethod` keeps "nobody sent a method" and "something arrived and could not be read"
 * apart, and this component must not re-collapse them:
 *
 *   absent      — no `method` key at either level. Render NOTHING. This is a card, not the
 *                 export: most archetypes never carry a method at all, and a sentence saying so
 *                 on every single card would be noise that trains a reader to stop reading it.
 *   unreadable  — a `method` key arrived and `readMethod` refused it. This MUST be visible,
 *                 distinctly from absent, because a producer that sent something off-contract is
 *                 a different (and more actionable) fact than a producer that sent nothing.
 *   present     — the formula, its inputs, bound, bound_defaulted and producer_sha, each drawn
 *                 by the same rules `methodSection` uses: a key's PRESENCE decides the branch,
 *                 never its truthiness, so a bound of `0` or a `bound_defaulted` of `false`
 *                 still reads as a stated answer rather than as nothing.
 *
 * None of the three strings above are retyped here — `METHOD_ABSENT_SENTENCE`, `ABSENT_MARK` and
 * `NOT_STATED_MARK` are imported from `cardExport.ts` so the card and the export can never read
 * the same state as two different words.
 */
export function MethodBlockView({ method }: { method: ArtifactMethod }) {
  if (method.state === "absent") return null;

  if (method.state === "unreadable") {
    return (
      <div
        data-cx-method="unreadable"
        className="mt-2 pt-2 border-t border-slate-800/60 font-mono text-[10px] text-slate-500 italic"
      >
        {METHOD_ABSENT_SENTENCE} (sent, but not readable as a method block)
      </div>
    );
  }

  const m = method.block;

  return (
    <div data-cx-method="present" className="mt-2 pt-2 border-t border-slate-800/60">
      <h4 className="font-mono text-[9px] uppercase tracking-widest text-slate-600">
        How the producer computed this
      </h4>
      <p
        data-cx-method-formula
        className="mt-1 font-mono text-[11px] text-slate-300 break-words"
      >
        {m.formula}
      </p>
      {m.inputs.length > 0 ? (
        <table className="mt-1.5 w-full font-mono text-[10px]" data-cx-method-inputs>
          <thead>
            <tr className="text-slate-600">
              <th className="text-left font-normal pr-2">name</th>
              <th className="text-left font-normal pr-2">value</th>
              <th className="text-left font-normal">unit</th>
            </tr>
          </thead>
          <tbody>
            {m.inputs.map((i, idx) => (
              <tr key={`${i.name}-${idx}`} className="text-slate-400">
                <td className="pr-2">{i.name}</td>
                <td className="pr-2 text-slate-300">{formatLeaf(i.value)}</td>
                <td>
                  {i.unit === null ? (
                    <span className="text-rose-300/80 italic">{ABSENT_MARK}</span>
                  ) : (
                    i.unit
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          inputs: <span className="text-rose-300/80 italic">{ABSENT_MARK}</span>
        </p>
      )}
      {/* `=== null` / `!== null` — see `methodSection` in cardExport.ts. A bound of `0` is a
          stated bound and must draw as `"0"`, not as absent; a `!!` or a truthy test here would
          repeat the exact defect that reader was written to avoid. */}
      {m.bound !== null ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          bound: <strong className="text-slate-300">{formatLeaf(m.bound)}</strong>
        </p>
      ) : m.boundUnreadable !== null ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          bound: <strong className="text-slate-300">{m.boundUnreadable}</strong>{" "}
          <span className="text-rose-300/80 italic">
            (not a number — stated by the producer, unparsed here)
          </span>
        </p>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          bound: <span className="text-rose-300/80 italic">{ABSENT_MARK}</span>
        </p>
      )}
      {/* Three branches for three states — `null` is "the producer did not say", a fact a reader
          recomputing the formula needs, and distinct from `false` ("the caller chose it"). No
          `!!` on this field, ever — see `MethodBlock.bound_defaulted` in cardExport.ts. */}
      {m.bound_defaulted === null ? (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          bound_defaulted: <span className="text-slate-400 italic">{NOT_STATED_MARK}</span>
        </p>
      ) : (
        <p className="mt-1.5 font-mono text-[10px] text-slate-500">
          bound_defaulted: <strong className="text-slate-300">{String(m.bound_defaulted)}</strong>{" "}
          <span className="text-slate-500">
            ({m.bound_defaulted ? "the producer's own default" : "chosen by the caller"})
          </span>
        </p>
      )}
      <p
        data-cx-method-producer-sha
        className="mt-1.5 font-mono text-[10px] text-slate-500"
      >
        producer_sha:{" "}
        {m.producer_sha === null ? (
          <span className="text-rose-300/80 italic">{ABSENT_MARK}</span>
        ) : (
          <strong className="text-slate-300">{m.producer_sha}</strong>
        )}
      </p>
    </div>
  );
}
