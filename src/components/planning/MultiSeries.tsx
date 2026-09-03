import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatAmount } from "@/lib/formatAmount";
import {
  ACCENT,
  SERIES_SECONDARY,
  LIMIT,
  MUTED,
  GRID_LINE,
  OVER,
} from "@/lib/chartPalette";
import {
  readReference,
  validateMultiSeries,
  type SeriesDecl,
} from "./MultiSeries.contract";

/**
 * MULTI_SERIES — several DECLARED series over the same periods.
 *
 * A LIVE VIEW (ADR-0042).
 *
 * NOTHING ABOUT WHICH SERIES EXIST IS WRITTEN IN THIS FILE, and that is the whole point. The
 * neighbouring archetype hardcodes `dataKey="capex"` and `dataKey="expense"`, which is how a
 * generic-sounding name ended up meaning one producer's cost curve. Every line here comes from
 * the payload's own `series` declaration, so a third consumer with three series needs no edit.
 *
 * NO CAP, NO THRESHOLD, NO OVER-LIMIT. Those are PERIOD_SERIES's vocabulary and they are absent
 * on purpose: a burn rate has no cap and an index cannot breach one.
 *
 * IT KNOWS NO DOMAIN. "Burn", "CPI", "planned" appear nowhere; the payload supplies the labels.
 */

/**
 * Line colours, assigned by POSITION in the declaration.
 *
 * Deliberately not keyed on the series name — a palette that knew "burn" from "planned" would
 * be this component learning its first consumer's vocabulary, which is the defect it exists to
 * avoid. Position is arbitrary and honest; the legend carries the meaning.
 */
const LINE_COLOURS = [ACCENT, SERIES_SECONDARY, LIMIT, OVER, MUTED];

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
          {scope ? `${scope} — nothing to draw` : "nothing to draw"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

export function MultiSeries({
  rows,
  series,
  reference,
  verdict,
  value_label,
  scope_label,
  valid_as_of,
  state_version,
}: {
  rows: unknown;
  series: unknown;
  reference?: unknown;
  verdict?: string;
  value_label?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}) {
  const result = validateMultiSeries(rows, series);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  const { rows: data, series: decls, unit } = result.data;

  // A DIMENSIONLESS SERIES IS NOT AN UNKNOWN CURRENCY. With no unit the axis reads `1.2`, which
  // is what a ratio is; `formatAmount` already declines to invent a symbol it was not given, so
  // the same formatter serves both and neither surface guesses.
  const fmt = (v: number) => formatAmount(v, unit ?? undefined);
  const ref = readReference(reference);

  return (
    <div className="glass-panel p-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full bg-neon-cyan/80 flex-shrink-0" />
        <h3 className="font-semibold text-slate-100">Trends</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {data.length} {data.length === 1 ? "period" : "periods"} · {decls.length}{" "}
          {decls.length === 1 ? "series" : "series"}
          {value_label ? ` · ${value_label}` : ""}
          {/* SAID OUT LOUD when there is no unit. A bare axis could be dollars nobody labelled
              or a ratio; the payload knows which, so the card says which. */}
          {unit === null ? " · dimensionless" : ` · ${unit}`}
        </span>
        {/* THE PRODUCER'S VERDICT, verbatim, or nothing at all. Never computed from where a
            series sits against the reference: below a target is bad for an index and good for
            a cost ratio, and this card cannot tell which it is looking at. */}
        {verdict && (
          <span
            className="font-mono text-[10px] uppercase tracking-widest"
            style={{ color: OVER }}
            data-verdict
          >
            {verdict}
          </span>
        )}
      </div>

      <div className="mt-3" style={{ width: "100%", height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} />
            <XAxis dataKey="period" tick={{ fill: MUTED, fontSize: 11 }} />
            {/* ZOOMED TO THE DATA, not anchored at zero. Two indices between 0.78 and 1.00 drawn
                against a 0 baseline occupy the top fifth of the chart and their movement — which
                is the whole question — becomes invisible. The reference is included in the
                domain so a declared line is never off-screen. */}
            <YAxis
              tickFormatter={fmt}
              tick={{ fill: MUTED, fontSize: 11 }}
              width={64}
              domain={[
                (min: number) => (ref ? Math.min(min, ref.value) : min),
                (max: number) => (ref ? Math.max(max, ref.value) : max),
              ]}
            />
            <Tooltip
              contentStyle={{
                background: "#0b1220",
                border: "1px solid rgba(148,163,184,0.18)",
                fontFamily: "monospace",
                fontSize: 11,
              }}
              formatter={(v: unknown) => (typeof v === "number" ? fmt(v) : String(v ?? "—"))}
            />
            <Legend
              align="left"
              verticalAlign="bottom"
              wrapperStyle={{ fontFamily: "monospace", fontSize: 10, color: MUTED }}
            />
            {/* A DECLARED line, drawn dashed so it never reads as a measured series. Its label
                is the producer's word for it, or the bare value when they sent none — this card
                does not name it "target", because it does not know that it is one. */}
            {ref && (
              <ReferenceLine
                y={ref.value}
                stroke={OVER}
                strokeDasharray="6 4"
                label={{
                  value: ref.label ? `${ref.label} ${fmt(ref.value)}` : fmt(ref.value),
                  position: "right",
                  fill: OVER,
                  fontFamily: "monospace",
                  fontSize: 10,
                }}
              />
            )}
            {decls.map((d: SeriesDecl, i: number) => (
              <Line
                key={d.key}
                type="monotone"
                dataKey={d.key}
                name={d.label}
                stroke={LINE_COLOURS[i % LINE_COLOURS.length]}
                strokeWidth={2}
                // FORM AS WELL AS HUE, when the producer asks for it. A dashed stroke survives
                // a washed-out projector in a way a second teal does not — the same reason the
                // funding grid tells provisional cells apart by their border rather than their
                // fill.
                strokeDasharray={d.dashed ? "6 4" : undefined}
                dot={false}
                // A GAP IS A GAP. Recharts would otherwise bridge a missing period with a
                // straight line, drawing a measurement nobody took.
                connectNulls={false}
              >
                {/* THE LAST VALUE, AT THE LAST POINT. A reader tracing two lines to the right
                    edge should not have to cross-reference a legend to learn where each ended.
                    Only the final point is labelled; labelling every point is a table. */}
                <LabelList
                  dataKey={d.key}
                  content={(props: unknown) => {
                    const q = props as {
                      index?: number;
                      x?: number;
                      y?: number;
                      value?: number;
                    };
                    if (q.index !== data.length - 1) return null;
                    if (typeof q.value !== "number") return null;
                    return (
                      <text
                        x={(q.x ?? 0) - 6}
                        y={(q.y ?? 0) - 8}
                        textAnchor="end"
                        fill={LINE_COLOURS[i % LINE_COLOURS.length]}
                        fontFamily="monospace"
                        fontSize={10}
                      >
                        {`${d.label} ${fmt(q.value)}`}
                      </text>
                    );
                  }}
                />
              </Line>
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {(valid_as_of || state_version !== undefined) && (
        <p className="mt-3 font-mono text-[9px] text-slate-500">
          {valid_as_of && <>valid as of {valid_as_of}</>}
          {state_version !== undefined && <> · state v{state_version}</>}
        </p>
      )}
    </div>
  );
}
