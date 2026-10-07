/**
 * THE RAW SECTION — the human's 2026-10-07 ruling (ADR-0055 amendment requested of Lane 1).
 *
 * Every payload key an archetype did not declare, and that is not STRUCTURAL, is drawn here: one
 * native <details>, CLOSED by default, under a label saying no rendering was declared.
 *
 * NO FORMATTER OF ANY KIND. A value is `JSON.stringify(value, null, 2)` and nothing else — no
 * units, no locale, no currency — so an hours count can never be printed as dollars. (Whether a
 * field may appear on this surface at all is the producer's obligation, not this component's:
 * see `src/lib/unconsumedFields.ts`'s header.)
 */

function show(value: unknown): string {
  if (value === undefined) return "undefined";
  const s = JSON.stringify(value, null, 2);
  // JSON.stringify returns undefined for functions/symbols; say so rather than print nothing.
  return s === undefined ? String(value) : s;
}

export function RawFields({ fields }: { fields: Record<string, unknown> }) {
  const keys = Object.keys(fields).sort();
  if (keys.length === 0) return null;
  return (
    <details data-raw-fields={keys.length} className="mt-1">
      {/* Stop pointerdown so opening it does not start a canvas drag — same as StageCard's
          interactive children (`onPointerDown={(e) => e.stopPropagation()}`). */}
      <summary
        className="cursor-pointer font-mono text-[10px] text-slate-500"
        onPointerDown={(e) => e.stopPropagation()}
      >
        Raw — {keys.length} field(s) with no declared rendering
      </summary>
      <div className="mt-1 space-y-1">
        {keys.map((key) => (
          <div key={key} data-raw-field={key}>
            <span className="font-mono text-[10px] text-slate-400">{key}</span>
            <pre className="mt-0.5 overflow-x-auto whitespace-pre-wrap rounded bg-black/30 p-2 font-mono text-[10px] text-slate-300">
              {show(fields[key])}
            </pre>
          </div>
        ))}
      </div>
    </details>
  );
}
