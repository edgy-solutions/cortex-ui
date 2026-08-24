import { useMemo } from 'react';
import { CHART_ROW_REQUIREMENTS } from './ChartWidget.contract';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { Share2 } from 'lucide-react';

interface ChartWidgetProps {
  data: string; // The stringified JSON array from Engine A/BAML
  type: 'BAR' | 'LINE' | 'PIE' | 'SCATTER';
  subject: string;
  sql: string;
  onPublish: (sql: string, title: string) => void;
}

/**
 * Color palette for multi-series charts. Picked to be visually
 * distinguishable while staying tonally adjacent to the cyan accent
 * the rest of the cortex UI uses. Order matters — series get colors
 * in index order, so the first series is always cyan to match the
 * existing single-series accent. Wraps via `% length` for the rare
 * many-series case.
 */
const SERIES_COLORS = [
  '#06b6d4', // cyan
  '#a78bfa', // violet
  '#f472b6', // pink
  '#84cc16', // lime
  '#fb923c', // orange
  '#facc15', // yellow
];

/**
 * Detect a row's "shape" so the chart can render either single-series
 * (the existing `[{name, value}]` shape) or multi-series (the
 * multi-dim row shape like `[{region, plan, count}, ...]`).
 *
 * Algorithm — type each column as `categorical` (string-typed across
 * rows) or `numeric` (number-typed). Then:
 *
 *   1 categorical + ≥1 numeric → single-series. X-axis = categorical;
 *     series = first numeric. The existing chart's hardcoded
 *     `dataKey="name"` + `dataKey="value"` is exactly this when
 *     the data has those literal keys; the new code generalizes to
 *     ANY 1-categorical+1-numeric row shape.
 *
 *   ≥2 categorical + ≥1 numeric → multi-series. X-axis = first
 *     categorical; series = SECOND categorical's unique values
 *     (pivoted into one column per series). Series values = first
 *     numeric. This closes the `[[multi-dim-chart-normalizer-gap]]`
 *     for the rendering layer: a "SELECT region, plan, COUNT(*)
 *     GROUP BY region, plan" row format now produces grouped bars,
 *     not the duplicate-region collapse the old hardcoded
 *     dataKey="name" produced.
 *
 *   No categorical OR no numeric → empty. The widget renders an
 *   empty state honestly (better than a confusing fake render).
 *
 * Returns a normalized shape the chart can hand straight to Recharts.
 */
type NormalizedShape =
  | {
      kind: "single";
      xKey: string;
      valueKey: string;
      data: Array<Record<string, unknown>>;
    }
  | {
      kind: "multi";
      xKey: string;
      seriesKeys: string[];
      data: Array<Record<string, unknown>>;
    }
  | {
      // Scatter — both axes numeric. Used by SCATTER chart type.
      kind: "scatter";
      xKey: string;
      yKey: string;
      data: Array<Record<string, unknown>>;
    }
  | {
      // Scatter with a categorical series column. Each unique value
      // of seriesKey becomes its own colored cluster of points.
      kind: "scatter-multi";
      xKey: string;
      yKey: string;
      seriesKey: string;
      seriesGroups: Record<string, Array<Record<string, unknown>>>;
      seriesKeys: string[];
    }
  | { kind: "empty"; reason: string };

// EXPORTED for test. The eight refusal reasons and the CHART_ROW_REQUIREMENTS thresholds
// are the contract's behavioural half; slice 2c deletes 194 lines of backend compensation on
// the claim that this function's acceptance conditions ARE the contract, so they need a test
// that executes them rather than a type that describes them.
export function normalizeChartData(
  rows: Array<Record<string, unknown>>,
  chartType?: "BAR" | "LINE" | "PIE" | "SCATTER"
): NormalizedShape {
  if (!Array.isArray(rows) || rows.length < CHART_ROW_REQUIREMENTS.minRows) {
    return { kind: "empty", reason: "no rows" };
  }
  const first = rows[0];
  if (!first || typeof first !== "object") {
    return { kind: "empty", reason: "rows aren't objects" };
  }

  // Classify each key by the type of its FIRST-row value. The row
  // shape is assumed consistent across rows (which is what
  // GROUP BY produces and what the backend's chart_data emitter is
  // expected to honor). If a key's type varies row-to-row, the
  // first-row classification still gives a sensible answer.
  const keys = Object.keys(first);
  const categoricalKeys: string[] = [];
  const numericKeys: string[] = [];
  for (const k of keys) {
    const v = first[k];
    if (typeof v === "number") numericKeys.push(k);
    else if (typeof v === "string") categoricalKeys.push(k);
    // booleans / objects / nulls are ignored — chart_data isn't
    // supposed to carry them, and silently dropping is safer than
    // miscategorizing.
  }

  // Requirement read FROM the contract, not restated here — the component cannot enforce
  // a rule ChartWidget.contract.ts does not declare.
  if (numericKeys.length < CHART_ROW_REQUIREMENTS.minNumericColumns) {
    return { kind: "empty", reason: "no numeric column" };
  }

  // SCATTER-specific shape detection — fires when the chart type
  // explicitly asks for SCATTER. Requires 2 numeric columns (x and
  // y). A 3rd categorical column, if present, becomes the series
  // discriminator (colored clusters).
  if (chartType === "SCATTER") {
    if (numericKeys.length < CHART_ROW_REQUIREMENTS.minNumericColumnsForScatter) {
      return {
        kind: "empty",
        reason: "scatter requires 2 numeric columns (x and y)",
      };
    }
    const xKey = numericKeys[0];
    const yKey = numericKeys[1];

    if (categoricalKeys.length === 0) {
      return { kind: "scatter", xKey, yKey, data: rows };
    }

    // Multi-cluster scatter — group rows by the first categorical.
    const seriesKey = categoricalKeys[0];
    const seriesGroups: Record<string, Array<Record<string, unknown>>> = {};
    for (const row of rows) {
      const s = row[seriesKey];
      if (typeof s !== "string") continue;
      if (!seriesGroups[s]) seriesGroups[s] = [];
      seriesGroups[s].push(row);
    }
    const seriesKeys = Object.keys(seriesGroups).sort();
    if (seriesKeys.length === 0) {
      return { kind: "empty", reason: "no series values in scatter data" };
    }
    return {
      kind: "scatter-multi",
      xKey,
      yKey,
      seriesKey,
      seriesGroups,
      seriesKeys,
    };
  }

  // Categorical-axis charts (BAR / LINE / PIE) — need at least one
  // categorical column for the x-axis / slice labels.
  if (categoricalKeys.length < CHART_ROW_REQUIREMENTS.minCategoricalColumnsForCategoricalAxis) {
    return { kind: "empty", reason: "no categorical column" };
  }

  // Single-series: 1 categorical + N numeric → render the FIRST
  // numeric against the categorical. Multi-numeric in the SAME row
  // (e.g. "revenue + cost per quarter") is a future enhancement;
  // today we still cover the standard case.
  if (categoricalKeys.length === 1) {
    return {
      kind: "single",
      xKey: categoricalKeys[0],
      valueKey: numericKeys[0],
      data: rows,
    };
  }

  // Multi-series: ≥2 categorical + 1 numeric → pivot.
  // X-axis = first categorical (e.g. "region")
  // Series = unique values of second categorical (e.g. "plan")
  // Value = first numeric (e.g. "customer_count")
  const xKey = categoricalKeys[0];
  const seriesKey = categoricalKeys[1];
  const valueKey = numericKeys[0];

  const pivoted = new Map<string, Record<string, unknown>>();
  const seriesValues = new Set<string>();

  for (const row of rows) {
    const x = row[xKey];
    const s = row[seriesKey];
    const v = row[valueKey];
    if (typeof x !== "string" || typeof s !== "string" || typeof v !== "number") {
      // Skip malformed rows rather than silently misrender.
      continue;
    }
    if (!pivoted.has(x)) {
      // Seed the pivoted row with the x-key value so Recharts can
      // read it via `dataKey={xKey}`.
      pivoted.set(x, { [xKey]: x });
    }
    pivoted.get(x)![s] = v;
    seriesValues.add(s);
  }

  // Stable-sort series keys for consistent color assignment across
  // re-renders. Sorting alphabetically is a defensible default; a
  // future enhancement could sort by total volume (largest series
  // first) for visual prominence.
  const seriesKeys = Array.from(seriesValues).sort();
  const data = Array.from(pivoted.values());

  if (data.length === 0 || seriesKeys.length === 0) {
    return { kind: "empty", reason: "pivot produced no rows" };
  }

  // Backfill missing-series values with 0 so Recharts doesn't render
  // gaps for combinations the source data didn't include (e.g. APAC
  // having no "enterprise" rows). This is honest: missing-from-source
  // → 0 in the pivoted view IS what the row data says.
  for (const row of data) {
    for (const sk of seriesKeys) {
      if (typeof row[sk] !== "number") row[sk] = 0;
    }
  }

  return { kind: "multi", xKey, seriesKeys, data };
}

const AXIS_STYLE = {
  stroke: "#64748b",
  fontSize: 10,
  tickLine: false as const,
  axisLine: false as const,
};
const AXIS_TICK = { fill: "#94a3b8" };

/**
 * Compact numeric axis ticks.
 *
 * The defect this fixes: the value axes render raw numbers into a NEGATIVE left margin
 * (`left: -20` / `-10` below, deliberate, to buy plot width). A seven-digit tick like
 * 1500000 is wider than the gutter that margin leaves, so its leading digits are clipped
 * off the edge — an axis reading "000000 / 500000 / 000000" where the values are actually
 * 0 / 500K / 1M / 1.5M. It looks like a formatter bug and is really a truncation, which is
 * worse than unreadable: the digits that survive are a plausible wrong number.
 *
 * Deliberately UNIT-LESS. `CHART_WIDGET_CONTRACT` declares no unit, currency or value-kind
 * field, so there is nothing in the payload that says these are dollars. Rendering "$1.5M"
 * would be the axis asserting a unit the answer never claimed — the same defect as the
 * hardcoded engine name this commit removes from the footer, wearing a different costume.
 * When the contract grows a unit field, this reads it; until then it stays honest about
 * magnitude only.
 */
export function formatAxisValue(v: number | string): string {
  // An empty/blank string coerces to 0, which would print a ZERO the payload never sent —
  // a fabricated value is worse than a blank tick. Echo it instead.
  if (typeof v === "string" && v.trim() === "") return v;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const abs = Math.abs(n);
  // Trim a trailing ".0" so 1.0M reads 1M, but keep 1.5M.
  const compact = (scaled: number, suffix: string) =>
    `${scaled.toFixed(1).replace(/\.0$/, "")}${suffix}`;
  if (abs >= 1e9) return compact(n / 1e9, "B");
  if (abs >= 1e6) return compact(n / 1e6, "M");
  if (abs >= 1e3) return compact(n / 1e3, "K");
  // Below 1000 the raw value already fits, and rounding it would destroy precision the
  // reader can still use.
  return String(n);
}
const TOOLTIP_STYLE = {
  backgroundColor: "rgba(15, 23, 42, 0.9)",
  borderColor: "rgba(6, 182, 212, 0.4)",
  borderRadius: "12px",
  backdropFilter: "blur(12px)",
  border: "1px solid rgba(6, 182, 212, 0.2)",
  fontSize: "12px",
  color: "#f1f5f9",
};

export const ChartWidget = ({ data, type, subject, sql, onPublish }: ChartWidgetProps) => {
  // Parse + normalize once. Recharts is sensitive to re-creating
  // data arrays on every render (it triggers expensive re-layout);
  // useMemo guards against that.
  const shape = useMemo<NormalizedShape>(() => {
    let rows: unknown;
    try {
      rows = JSON.parse(data);
    } catch (e) {
      console.error("Failed to parse chart data:", e);
      return { kind: "empty", reason: "JSON parse failure" };
    }
    if (!Array.isArray(rows)) return { kind: "empty", reason: "not an array" };
    return normalizeChartData(rows as Array<Record<string, unknown>>, type);
  }, [data, type]);

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden group">
      {/* The pre-existing background BarChart3 decoration (faint cyan
          icon at top-right) was removed 2026-06-26 during Phase 2 chart
          hardening — visual noise the user flagged on inspection. The
          chart speaks for itself; no decoration needed. */}

      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8 relative z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
            <h3 className="text-xl font-bold text-white tracking-tight leading-none">{subject}</h3>
          </div>
          {/* Descriptors only — never attribution. This line used to name a specific
              producing engine unconditionally (see ChartWidget.attribution.test.ts, which
              pins the removed literals), which the widget has no way to know:
              SemanticInterpreter passes only
              contract fields (chart_data / chart_type / subject_concept / sql_query), so
              the label was a template's assumption about where answers come from. It was
              wrong for every Engine P answer, which is precisely the demo's thesis
              inverted — a provenance product mislabelling its own provenance. What
              remains is derived from the parsed data and is therefore true. Real
              attribution lives in the HUD, which reads it off the artifact's routing. */}
          <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
            Chart Preview
            {shape.kind === "multi" && (
              <span className="ml-2 text-violet-400/70">
                · {shape.seriesKeys.length}-series pivot
              </span>
            )}
            {shape.kind === "scatter-multi" && (
              <span className="ml-2 text-violet-400/70">
                · {shape.seriesKeys.length} clusters
              </span>
            )}
          </p>
        </div>

        <button
          className="btn-publish flex items-center gap-2 group/btn"
          onClick={() => onPublish(sql, subject)}
        >
          <Share2 className="w-3.5 h-3.5 group-hover/btn:scale-110 transition-transform" />
          <span>Publish to Superset</span>
        </button>
      </div>

      <div className="h-[350px] w-full relative z-10">
        {shape.kind === "empty" ? (
          <div className="h-full w-full flex flex-col items-center justify-center gap-2">
            <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
              Chart data not renderable
            </p>
            <p className="font-mono text-[9px] text-slate-500">
              {shape.reason}
            </p>
          </div>
        ) : type === 'PIE' && shape.kind === "single" ? (
          // PIE — single-dim natural fit: one slice per row. Multi-
          // dim doesn't apply (pie is fundamentally one-series).
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
              <Legend
                wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                iconType="circle"
              />
              <Pie
                data={shape.data}
                dataKey={shape.valueKey}
                nameKey={shape.xKey}
                cx="50%"
                cy="50%"
                outerRadius={120}
                innerRadius={50}
                paddingAngle={2}
                animationDuration={1200}
                label={(entry: any) =>
                  `${entry[shape.xKey]}: ${entry[shape.valueKey]}`
                }
                labelLine={false}
              >
                {shape.data.map((_, i) => (
                  <Cell
                    key={i}
                    fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                    stroke="rgba(15, 23, 42, 0.6)"
                    strokeWidth={2}
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        ) : type === 'SCATTER' &&
          (shape.kind === "scatter" || shape.kind === "scatter-multi") ? (
          // SCATTER — both axes numeric. Single-series renders one
          // cluster in cyan; multi-cluster colors each categorical
          // group from the SERIES_COLORS palette with a legend.
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" opacity={0.3} />
              <XAxis
                type="number"
                dataKey={shape.xKey}
                name={shape.xKey}
                {...AXIS_STYLE}
                tick={AXIS_TICK}
              />
              <YAxis
                type="number"
                dataKey={shape.yKey}
                name={shape.yKey}
                {...AXIS_STYLE}
                tick={AXIS_TICK}
                tickFormatter={formatAxisValue}
              />
              <ZAxis range={[60, 60]} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                cursor={{ strokeDasharray: '3 3', stroke: '#06b6d4' }}
              />
              {shape.kind === "scatter" ? (
                <Scatter
                  data={shape.data}
                  fill={SERIES_COLORS[0]}
                  fillOpacity={0.75}
                  stroke={SERIES_COLORS[0]}
                  animationDuration={1200}
                />
              ) : (
                <>
                  <Legend
                    wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                    iconType="circle"
                  />
                  {shape.seriesKeys.map((sk, i) => (
                    <Scatter
                      key={sk}
                      name={sk}
                      data={shape.seriesGroups[sk]}
                      fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                      fillOpacity={0.75}
                      stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                      animationDuration={1200}
                    />
                  ))}
                </>
              )}
            </ScatterChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            {type === 'LINE' ? (
              <LineChart data={(shape.kind === "single" || shape.kind === "multi") ? shape.data : []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                {(shape.kind === "single" || shape.kind === "multi") && (
                  <XAxis dataKey={shape.xKey} {...AXIS_STYLE} tick={AXIS_TICK} />
                )}
                <YAxis {...AXIS_STYLE} tick={AXIS_TICK} tickFormatter={formatAxisValue} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  itemStyle={{ color: '#22d3ee' }}
                  cursor={{ stroke: '#06b6d4', strokeWidth: 1 }}
                />
                {shape.kind === "single" ? (
                  <Line
                    type="monotone"
                    dataKey={shape.valueKey}
                    stroke={SERIES_COLORS[0]}
                    strokeWidth={3}
                    dot={{ r: 4, fill: '#0f172a', stroke: SERIES_COLORS[0], strokeWidth: 2 }}
                    activeDot={{ r: 6, fill: SERIES_COLORS[0], stroke: '#fff', strokeWidth: 2 }}
                    animationDuration={1500}
                  />
                ) : shape.kind === "multi" ? (
                  <>
                    <Legend
                      wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                      iconType="rect"
                    />
                    {shape.seriesKeys.map((sk, i) => (
                      <Line
                        key={sk}
                        type="monotone"
                        dataKey={sk}
                        stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                        strokeWidth={2}
                        dot={{ r: 3, fill: '#0f172a', stroke: SERIES_COLORS[i % SERIES_COLORS.length], strokeWidth: 2 }}
                        animationDuration={1200}
                      />
                    ))}
                  </>
                ) : null}
              </LineChart>
            ) : (
              <BarChart data={(shape.kind === "single" || shape.kind === "multi") ? shape.data : []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} opacity={0.3} />
                {(shape.kind === "single" || shape.kind === "multi") && (
                  <XAxis dataKey={shape.xKey} {...AXIS_STYLE} tick={AXIS_TICK} />
                )}
                <YAxis {...AXIS_STYLE} tick={AXIS_TICK} tickFormatter={formatAxisValue} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: 'rgba(6, 182, 212, 0.05)' }}
                />
                {shape.kind === "single" ? (
                  <>
                    <Bar
                      dataKey={shape.valueKey}
                      fill="url(#barGradient)"
                      radius={[4, 4, 0, 0]}
                      animationDuration={1500}
                      // Render zero values as a 2px visible marker on
                      // the baseline so "0" is distinguishable from
                      // "no data." Without this, 0 collapses to
                      // invisible — same shape as `[[ui-surfaces-
                      // wrong-path]]` at the chart layer: missing-
                      // looking-like-zero is the visual conflation
                      // we close here.
                      minPointSize={2}
                    />
                    <defs>
                      <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={SERIES_COLORS[0]} stopOpacity={0.8} />
                        <stop offset="100%" stopColor={SERIES_COLORS[0]} stopOpacity={0.2} />
                      </linearGradient>
                    </defs>
                  </>
                ) : shape.kind === "multi" ? (
                  <>
                    <Legend
                      wrapperStyle={{ fontSize: '10px', paddingTop: '8px' }}
                      iconType="rect"
                    />
                    {shape.seriesKeys.map((sk, i) => (
                      <Bar
                        key={sk}
                        dataKey={sk}
                        fill={SERIES_COLORS[i % SERIES_COLORS.length]}
                        radius={[4, 4, 0, 0]}
                        animationDuration={1200}
                        // Zero renders as a 2px baseline marker (NOT
                        // a gap) so "0 customers in this region·plan
                        // combination" is visually distinct from "no
                        // data for this combination." Honest-
                        // degradation discipline at the chart layer.
                        minPointSize={2}
                      />
                    ))}
                  </>
                ) : null}
              </BarChart>
            )}
          </ResponsiveContainer>
        )}
      </div>

      {/* Footer — renders ONLY what this answer actually carries.
          Previously it printed a bare "SQL:" label with nothing after it (sql_query is
          optional in the contract and absent for a computed answer) beside a hardcoded
          hardcoded engine-name literal. That name was not read from anything — no
          provenance reaches this component — so every plan-state answer was captioned with
          the name of an engine that did not produce it. Attribution renders from the
          answer's own provenance or not at all; a chart with nothing to disclose shows no
          footer rather than an empty label. */}
      {sql ? (
        <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter shrink-0 max-w-full overflow-hidden">
            <div className="flex items-center gap-1 shrink-0 overflow-hidden">
              <span className="text-cyan-500/50">SQL:</span>
              <span className="truncate max-w-[200px]">{sql}</span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
};
