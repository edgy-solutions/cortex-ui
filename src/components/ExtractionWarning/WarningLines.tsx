import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { boundWarnings, type ShownWarning } from "@/lib/boundedWarning";

/**
 * One short line per warning, detail behind a click (architect ruling 2026-11-19).
 * Only bounded strings (see boundedWarning.ts) ever reach the DOM; a withheld string is
 * never placed in text, title, aria-label or data-*. The telemetry ref is plain text.
 */
function Line({ w }: { w: ShownWarning }) {
  const [open, setOpen] = useState(false);
  const expandable = w.telemetryRef !== null || w.withheld;
  const content = (
    <>
      {w.code && <span className="font-mono">{w.code}</span>}
      {w.code && " · "}
      {w.withheld ? <span data-warning-withheld>detail withheld</span> : w.message}
    </>
  );
  return (
    <li data-warning-line className="text-[11px] text-amber-200/90 leading-snug">
      {expandable ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="text-left hover:text-amber-100"
        >
          {content}
        </button>
      ) : (
        content
      )}
      {open && expandable && (
        <div data-warning-detail className="mt-0.5 ml-2 text-[10px] text-amber-200/70">
          {w.telemetryRef !== null && (
            <p>
              <span className="uppercase tracking-wider">telemetry ref</span>{" "}
              <span className="font-mono select-all">{w.telemetryRef}</span>
            </p>
          )}
          {w.withheld && (
            <p>The full text is not shown here: it is not a bounded message. It stays in telemetry.</p>
          )}
        </div>
      )}
    </li>
  );
}

export function WarningLines({ warnings, heading }: { warnings: unknown; heading: string }) {
  const shown = boundWarnings(warnings);
  if (shown.length === 0) return null;
  return (
    <div>
      <p className="flex items-center gap-1.5 font-mono text-[10px] font-bold text-amber-300 uppercase tracking-widest">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
        {heading}
      </p>
      <ul className="mt-1 space-y-0.5">
        {shown.map((w, i) => (
          <Line key={i} w={w} />
        ))}
      </ul>
    </div>
  );
}
