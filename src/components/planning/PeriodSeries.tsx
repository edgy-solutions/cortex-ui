/**
 * PERIOD_SERIES — a time-phased amount series against a governed cap line.
 *
 * A LIVE VIEW (ADR-0042). Its content is a function of mutable plan state and is replaced
 * wholesale on re-evaluation; it never caches rows as truth. Its FRESHNESS is per evaluation:
 * the stamp shown in the footer is the one THIS evaluation carried, never the one the card
 * was minted with. A card minted at 09:00 and re-evaluated at 11:20 while still showing 09:00
 * asserts that 11:20's numbers were true at 09:00 — the one place this species could quietly
 * lie, which is why §4 makes it a ruling and why the stamp is rendered rather than held.
 *
 * IT KNOWS NO DOMAIN. "Cost", "funding", "portfolio" appear nowhere: the payload carries its
 * own labels and the renderer draws a series of periods with a threshold. That is
 * GENERIC-AT-BIRTH, and it is the reason this component can serve a second question later
 * without being edited — the precedent is INSTANCES_BY_PROPERTY.
 *
 * ITS ACCEPTANCE RULES LIVE IN ITS CONTRACT, not here. `validatePeriodSeries` is imported
 * rather than reimplemented, which is the binding that makes the contract a HOME rather than
 * a description: this component cannot enforce a rule the contract does not state, because it
 * reads the rule from there.
 */
import { ACCENT, ACCENT_DEEP, OVER, LIMIT, MUTED, GRID_LINE } from "@/lib/chartPalette";
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { validatePeriodSeries, type PeriodSeriesRow } from "./PeriodSeries.contract";

export interface PeriodSeriesProps {
  rows: unknown;
  /** What this series is OF. Supplied by the payload — the component never invents it. */
  scope_label?: string;
  /**
   * The substrate sample-time THIS evaluation was true against, and the state version it
   * read. Both are rendered. A live view that hides them is indistinguishable from a stale
   * one that does.
   */
  valid_as_of?: string;
  state_version?: number;
}

const fmt = (n: number): string => {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

/**
 * The deliberate-empty state. Carries the CONTRACT'S OWN REFUSAL REASON, verbatim.
 *
 * Not a generic "no data" and not a blank chart: the reason is a registered discriminant the
 * backend can also read, which is what lets `select_presentation` choose a different archetype
 * rather than letting this one draw an empty box. Honest-empty is a contract clause here, not
 * a styling decision.
 */
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

export function PeriodSeries({
  rows, scope_label, valid_as_of, state_version,
}: PeriodSeriesProps) {
  const result = validatePeriodSeries(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const series: PeriodSeriesRow[] = result.rows;
  // The cap is per-period and MAY BE NULL (uncapped). A single reference line is drawn only
  // when every capped period shares one value — otherwise the line would assert a uniform
  // governance threshold that does not exist, and per-bar colouring already carries the truth.
  const caps = series.map((r) => r.cap).filter((c): c is number => typeof c === "number");
  const uniformCap = caps.length > 0 && caps.every((c) => c === caps[0]) ? caps[0] : null;
  const anyOver = series.some((r) => r.over_cap);

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${anyOver ? "bg-rose-500" : "bg-cyan-500"} animate-pulse`} />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Period series"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {series.length} {series.length === 1 ? "period" : "periods"}
          {anyOver && <span className="text-rose-400"> · over threshold</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(320, series.length * 90) }}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={series} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID_LINE} />
              <XAxis dataKey="period" tick={{ fill: MUTED, fontSize: 11 }} />
              <YAxis tickFormatter={fmt} tick={{ fill: MUTED, fontSize: 11 }} width={64} />
              <Tooltip
                // Typed loosely because recharts' Formatter admits undefined and non-numeric
                // values; narrowing here rather than casting the whole formatter keeps the
                // "no `any`" rule and still tells the truth about a missing value.
                formatter={(v: unknown, name: unknown) => [
                  typeof v === "number" ? fmt(v) : "—",
                  String(name ?? ""),
                ]}
                contentStyle={{
                  background: "rgba(2,6,23,0.92)", border: "1px solid rgba(56,189,248,0.25)",
                  borderRadius: 8, fontFamily: "monospace", fontSize: 12,
                }}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "monospace" }} />
              {/* Stacked, because "capex or expense?" is its own question (Q17) and a single
                  total would answer it by erasing it. */}
              <Bar dataKey="capex" stackId="a" name="capex" fill={ACCENT}>
                {series.map((r, i) => (
                  <Cell key={i} fill={r.over_cap ? OVER : ACCENT} />
                ))}
              </Bar>
              <Bar dataKey="expense" stackId="a" name="expense" fill={ACCENT_DEEP}>
                {series.map((r, i) => (
                  <Cell key={i} fill={r.over_cap ? OVER : ACCENT_DEEP} />
                ))}
              </Bar>
              {uniformCap !== null && (
                <ReferenceLine
                  y={uniformCap} stroke={LIMIT} strokeDasharray="4 4"
                  label={{ value: `cap ${fmt(uniformCap)}`, fill: LIMIT,
                           fontSize: 10, fontFamily: "monospace", position: "right" }}
                />
              )}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Per-period truth, including the periods a single reference line cannot describe.
          An UNCAPPED period says so — it never shows a 0 that would read as a breached line. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-white/10">
              {["period", "total", "cap", "over by"].map((h) => (
                <th key={h} className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/70">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {series.map((r) => (
              <tr key={r.period} className={r.over_cap ? "bg-rose-500/[0.06]" : undefined}>
                <td className="px-3 py-2 font-mono text-sm text-slate-100">{r.period}</td>
                <td className="px-3 py-2 font-mono text-sm text-slate-300">{fmt(r.total)}</td>
                <td className="px-3 py-2 font-mono text-sm text-slate-300">
                  {r.cap === null
                    ? <span className="text-slate-600">no cap recorded</span>
                    : fmt(r.cap)}
                </td>
                <td className="px-3 py-2 font-mono text-sm">
                  {r.over_cap && r.overage !== null
                    ? <span className="text-rose-400">{fmt(r.overage)}</span>
                    : <span className="text-slate-600">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* THE FRESHNESS STAMP (ADR-0042 §4). Per evaluation, never inherited from mint time. */}
      {(valid_as_of || state_version !== undefined) && (
        <div className="mt-4 pt-3 border-t border-white/5 flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-widest text-slate-500">
            {valid_as_of ? `as of ${valid_as_of}` : "as of —"}
          </span>
          {state_version !== undefined && (
            <span className="font-mono text-[9px] text-slate-600">state v{state_version}</span>
          )}
        </div>
      )}
    </div>
  );
}
