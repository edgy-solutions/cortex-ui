/**
 * STRUCTURED KEY/VALUE VIEW (201, 2026-10-20) — the one place an undeclared payload is drawn.
 *
 * A JSON dump in any answer card is a defect. Scalars are VERBATIM (the 2026-10-07 "NO FORMATTER"
 * ruling still holds: no units, no locale, no currency — just not JSON). A nested object or array
 * collapses into a native closed <details> whose summary says how big it is.
 *
 * This file never serialises a value to JSON text and never draws a preformatted block; a seal
 * (`noJsonDump.test.tsx`) greps it for both.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function scalarText(v: unknown): string {
  if (v === undefined) return "undefined";
  if (v === null) return "null";
  if (typeof v === "string") return v;
  return String(v);
}

function KeyValueTable({ fields }: { fields: Record<string, unknown> }) {
  const keys = Object.keys(fields).sort();
  return (
    <table className="w-full border-collapse font-mono text-[10px]">
      <tbody>
        {keys.map((key) => (
          <tr key={key} data-structured-field={key} className="align-top">
            <td className="pr-2 py-0.5 text-slate-400 whitespace-nowrap">{key}</td>
            <td className="py-0.5 text-slate-300 break-words">
              <StructuredValue value={fields[key]} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function StructuredValue({ value }: { value: unknown }) {
  // Stop pointerdown so opening a summary does not start a canvas drag (same as RawFields).
  const stop = (e: React.PointerEvent) => e.stopPropagation();
  if (Array.isArray(value)) {
    if (value.length === 0) return <span>{"[0 items]"}</span>;
    return (
      <details>
        <summary className="cursor-pointer text-slate-500" onPointerDown={stop}>
          {`[${value.length} items]`}
        </summary>
        <ol className="ml-4 list-decimal">
          {value.map((item, i) => (
            <li key={i}>
              <StructuredValue value={item} />
            </li>
          ))}
        </ol>
      </details>
    );
  }
  if (isPlainObject(value)) {
    const n = Object.keys(value).length;
    if (n === 0) return <span>{"{0 keys}"}</span>;
    return (
      <details>
        <summary className="cursor-pointer text-slate-500" onPointerDown={stop}>
          {`{${n} keys}`}
        </summary>
        <div className="ml-2">
          <KeyValueTable fields={value} />
        </div>
      </details>
    );
  }
  return <span>{scalarText(value)}</span>;
}

export function StructuredFields({
  fields,
  archetype,
  notDrawn,
}: {
  fields: Record<string, unknown>;
  archetype: string;
  /**
   * The archetype HAS a render and it did not draw this payload (its package is missing, its
   * payload key is absent, or a build flag holds it off). "no render registered" would be false
   * there, so the line says what is true instead.
   */
  notDrawn?: string;
}) {
  const count = Object.keys(fields).length;
  return (
    <div className="rounded border border-white/10 bg-black/30 p-2 backdrop-blur">
      {notDrawn === undefined ? (
        <div data-no-render-registered={archetype} className="mb-1 font-mono text-[11px] text-amber-300">
          {`no render registered for ${archetype}`}
        </div>
      ) : (
        <div data-render-not-drawn={archetype} className="mb-1 font-mono text-[11px] text-amber-300">
          {`${archetype} render not drawn: ${notDrawn}`}
        </div>
      )}
      <table data-structured-fields={count} className="w-full border-collapse font-mono text-[10px]">
        <tbody>
          {Object.keys(fields)
            .sort()
            .map((key) => (
              <tr key={key} data-structured-field={key} className="align-top">
                <td className="pr-2 py-0.5 text-slate-400 whitespace-nowrap">{key}</td>
                <td className="py-0.5 text-slate-300 break-words">
                  <StructuredValue value={fields[key]} />
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
