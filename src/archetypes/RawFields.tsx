import { StructuredValue } from "./StructuredFields";

/**
 * THE RAW SECTION — the human's 2026-10-07 ruling (ADR-0055 amendment requested of Lane 1).
 *
 * Every payload key an archetype did not declare, and that is not STRUCTURAL, is drawn here: one
 * native <details>, CLOSED by default, under a label saying no rendering was declared.
 *
 * NO FORMATTER OF ANY KIND. Scalars are VERBATIM, nested values collapsed, no JSON (201,
 * 2026-10-20): no units, no locale, no currency — so an hours count can never be printed as
 * dollars. (Whether a field may appear on this surface at all is the producer's obligation, not
 * this component's: see `src/lib/unconsumedFields.ts`'s header.)
 */

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
            <div className="mt-0.5 rounded bg-black/30 p-2 font-mono text-[10px] text-slate-300">
              <StructuredValue value={fields[key]} />
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}
