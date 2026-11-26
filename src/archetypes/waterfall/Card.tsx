import { useEffect, useMemo, useRef, useState } from "react";
import { StructuredFields } from "@/archetypes/StructuredFields";
import { SIGN_NEGATIVE, SIGN_POSITIVE } from "@/lib/chartPalette";
import type { FlowSign } from "../flow-decomposition/contract";
import { readProvenance } from "../flow-decomposition/contract";
import { ServedProvenance } from "../ServedProvenance";
import { WATERFALL_REFUSAL_WORDS, readWaterfall, type WaterfallRefusalReason } from "./contract";
import { buildBars, wrapLabel } from "./model";

/**
 * WATERFALL — a start total, one floating bar per level-1 step in served order, an end total
 * (contract.ts says what is read and when it is refused; model.ts walks the running total).
 *
 * NOT ONLY IN COLOUR: a step takes its sign colour, but its amount is also written with `+`/`−`
 * and carried in `data-waterfall-sign`. Start and end are neutral: a total, not a direction.
 * The remainder bar is dashed and carries `data-waterfall-remainder`.
 */

const SIGN_COLOUR: Record<FlowSign, string> = { positive: SIGN_POSITIVE, negative: SIGN_NEGATIVE, zero: "#94a3b8" };
const TOTAL_COLOUR = "#64748b";
const DEFAULT_WIDTH = 900;
const MARGIN = { top: 24, right: 8, left: 8 } as const;
const PLOT_HEIGHT = 240;
const CHAR_PX = 6.2;
const LINE_PX = 12;
/** Below this many characters per column, labels are rotated instead of wrapped. */
const MIN_WRAP_CHARS = 9;

function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function Refusal({ reason, detail, fields }: { reason: WaterfallRefusalReason; detail: string; fields: Record<string, unknown> }) {
  return (
    <div className="glass-panel p-4 my-4 border-amber-500/20 flex flex-col gap-3">
      <ServedProvenance text={readProvenance(fields)} data-waterfall-provenance />
      <div data-waterfall-refusal={reason} className="flex flex-col gap-1">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">nothing to draw — {WATERFALL_REFUSAL_WORDS[reason]}</p>
        <p className="font-mono text-[10px] text-amber-400/80">{detail}</p>
      </div>
      <StructuredFields fields={fields} archetype="WATERFALL" notDrawn={WATERFALL_REFUSAL_WORDS[reason]} />
    </div>
  );
}

export function Waterfall(props: Record<string, unknown>) {
  const read = useMemo(() => readWaterfall(props), [props]);
  const [ref, width] = useWidth();
  const bars = useMemo(() => (read.ok ? buildBars(read) : []), [read]);

  if (!read.ok) return <Refusal reason={read.refusal} detail={read.detail} fields={props} />;
  const table = read;

  const n = bars.length;
  const colW = (width - MARGIN.left - MARGIN.right) / n;
  const barW = Math.max(6, colW * 0.6);
  const maxChars = Math.floor((colW - 4) / CHAR_PX);
  const rotate = maxChars < MIN_WRAP_CHARS;
  const wrapped = bars.map((b) => (rotate ? [b.label] : wrapLabel(b.label, Math.max(1, maxChars))));
  const labelSpace = rotate
    ? Math.min(180, Math.ceil(Math.max(...bars.map((b) => b.label.length)) * CHAR_PX * 0.72) + 16)
    : Math.max(...wrapped.map((l) => l.length)) * LINE_PX + 12;

  const lo = Math.min(0, ...bars.map((b) => Math.min(b.from, b.to)));
  const hi = Math.max(0, ...bars.map((b) => Math.max(b.from, b.to)));
  const span = hi - lo === 0 ? 1 : hi - lo;
  const y = (v: number) => MARGIN.top + ((hi - v) / span) * PLOT_HEIGHT;
  const plotBottom = MARGIN.top + PLOT_HEIGHT;
  const height = plotBottom + labelSpace;
  const cx = (i: number) => MARGIN.left + colW * i + colW / 2;

  const header = [table.valueLabel, table.unit !== undefined ? `(${table.unit})` : undefined].filter((s) => s !== undefined).join(" ");

  return (
    <div data-archetype="WATERFALL" className="glass-panel p-4 my-4 flex flex-col gap-2">
      <ServedProvenance text={table.provenance} data-waterfall-provenance />
      {header !== "" && <h3 className="font-semibold text-slate-100">{header}</h3>}
      {table.verdict !== undefined && (
        <p data-waterfall-verdict className="text-xs text-slate-300">
          {table.verdict}
        </p>
      )}
      {table.notes.map((note, i) => (
        <p key={`${note.kind}-${i}`} data-waterfall-note={note.kind} className="font-mono text-[10px] text-amber-400/80">
          {note.text}
        </p>
      ))}
      <div ref={ref} className="w-full">
        <svg role="img" aria-label={header !== "" ? header : "waterfall"} viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ display: "block", maxWidth: "100%" }}>
          <line x1={MARGIN.left} x2={width - MARGIN.right} y1={y(0)} y2={y(0)} stroke="#334155" strokeWidth={1} />
          {bars.slice(1).map((b, i) => {
            const prev = bars[i];
            const level = b.kind === "end" ? prev.to : b.from;
            return (
              <line
                key={`c${i}`}
                data-waterfall-connector=""
                x1={cx(i) + barW / 2}
                x2={cx(i + 1) - barW / 2}
                y1={y(level)}
                y2={y(level)}
                stroke="#64748b"
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            );
          })}
          {bars.map((b, i) => {
            const top = y(Math.max(b.from, b.to));
            const h = Math.max(1, Math.abs(y(b.from) - y(b.to)));
            const colour = b.kind === "step" ? SIGN_COLOUR[b.sign] : TOTAL_COLOUR;
            return (
              <g
                key={`${b.kind}-${i}`}
                data-waterfall-bar={b.kind}
                {...(b.kind === "step" ? { "data-waterfall-sign": b.sign } : {})}
                {...(b.remainder ? { "data-waterfall-remainder": "" } : {})}
              >
                <rect
                  x={cx(i) - barW / 2}
                  y={top}
                  width={barW}
                  height={h}
                  fill={colour}
                  fillOpacity={0.9}
                  stroke={b.remainder ? "#e2e8f0" : "none"}
                  strokeDasharray={b.remainder ? "3 2" : undefined}
                />
                <text x={cx(i)} y={top - 4} textAnchor="middle" fontSize={10} fill="#e2e8f0" stroke="#050810" strokeWidth={3} paintOrder="stroke">
                  {b.text}
                </text>
                <text
                  textAnchor={rotate ? "end" : "middle"}
                  fontSize={10}
                  fill="#cbd5e1"
                  transform={rotate ? `translate(${cx(i)},${plotBottom + 10}) rotate(-40)` : undefined}
                >
                  {wrapped[i].map((line, j) => (
                    <tspan key={j} x={rotate ? 0 : cx(i)} y={rotate ? 0 : plotBottom + 12 + j * LINE_PX}>
                      {line}
                    </tspan>
                  ))}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
