/**
 * THRESHOLD_GRID — subjects × periods, each cell against a threshold that subject owns.
 *
 * A LIVE VIEW (ADR-0042). Content is replaced wholesale on re-evaluation; the freshness stamp
 * is the one THIS evaluation carried, never the mint-time one.
 *
 *
 * ── DIFFERENTIATE THE CELL TREATMENT, SHARE THE INTERACTION ──────────────────────────────
 *
 * This grid and its sibling sat adjacent on a board reading as ONE chart split in two: same
 * cell form, same padding, same big-number-over-small-number, differing only in colour ramp —
 * and a ramp is the first thing a projector washes out.
 *
 * So the FORM now carries the distinction, and it carries the RIGHT one. A ratio is
 * continuous: a subject can sit at 1.8 of a 2.0 line, anywhere along it. A maturity level is
 * ordinal: level 2 of 4 is a rung, not a position. A continuous bar under both would have
 * asserted that maturity is a smooth quantity, which is the same class of error as colouring
 * a maturity gap red — a claim about the measurement that the measurement does not make.
 *
 * The INTERACTION stays identical on purpose: click a cell, get its detail. The inspection
 * layer replaces both detail lines with one panel, and it can only do that if both surfaces
 * behave the same way. Diverging the interaction here would hand that build two patterns to
 * unify instead of one.
 *
 * IT KNOWS NO DOMAIN. "Site", "load", "saturation" appear nowhere — the payload supplies
 * `value_label` and the subject names. That is what lets the same renderer serve a second
 * question of this shape without being edited.
 *
 * TWO CLAUSES THE RENDERER HONOURS BECAUSE ITS CONTRACT STATES THEM, and both are things a
 * later "simplification" would break:
 *   - the threshold is read PER CELL. Hoisting it to a grid-level prop mis-colours every
 *     subject whose line differs from whichever one got hoisted.
 *   - an absent cell renders as a GAP, never as 0. A 0.0 in a heat grid reads as
 *     "measured, and fine", which is a different claim from "nothing was happening".
 */
import { CellInspector } from "./CellInspector";
import { showMeasure } from "@/lib/showMeasure";
import { useState } from "react";
import {
  gridAxes, validateThresholdGrid, type ThresholdCell,
} from "./ThresholdGrid.contract";

export interface ThresholdGridProps {
  rows: unknown;
  /** What the number MEANS. The renderer never invents a unit. */
  value_label?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}

/** Utilisation drives the ramp, NOT the raw value — subjects have different lines, so a raw
 *  ramp would make the tolerant subject look hotter than the breached one. */
function cellStyle(cell: ThresholdCell): string {
  if (cell.over_threshold) return "bg-rose-500/30 text-rose-100 ring-1 ring-rose-400/50";
  const ratio = cell.threshold > 0 ? cell.value / cell.threshold : 0;
  if (ratio >= 0.8) return "bg-amber-500/20 text-amber-100";
  if (ratio >= 0.5) return "bg-cyan-500/15 text-cyan-100";
  return "bg-slate-500/10 text-slate-300";
}

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

export function ThresholdGrid({
  rows, value_label, scope_label, valid_as_of, state_version,
}: ThresholdGridProps) {
  const [selected, setSelected] = useState<ThresholdCell | null>(null);
  const result = validateThresholdGrid(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const cells = result.cells;
  const { subjects, periods } = gridAxes(cells);
  const at = (s: string, p: string) =>
    cells.find((c) => c.subject_id === s && c.period === p) ?? null;
  const names = new Map(cells.map((c) => [c.subject_id, c.subject_name || c.subject_id]));
  const breached = cells.filter((c) => c.over_threshold);

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className={`w-2 h-2 rounded-full ${breached.length ? "bg-rose-500" : "bg-cyan-500"} animate-pulse`} />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Threshold grid"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {subjects.length} × {periods.length}
          {value_label && <span className="text-slate-400"> · {value_label}</span>}
          {breached.length > 0 && (
            <span className="text-rose-400"> · {breached.length} over threshold</span>
          )}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70" />
              {periods.map((p) => (
                <th key={p} className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 text-center">
                  {p}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => (
              <tr key={s}>
                <td className="px-3 py-2 font-mono text-sm text-slate-100 whitespace-nowrap">
                  {names.get(s)}
                </td>
                {periods.map((p) => {
                  const cell = at(s, p);
                  if (!cell) {
                    // THE GAP. Absent is not zero — see the contract's absentCellsAreNotZero.
                    return (
                      <td key={p} className="px-3 py-3 text-center">
                        <span className="font-mono text-[11px] text-slate-700">·</span>
                      </td>
                    );
                  }
                  return (
                    <td key={p} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelected(cell)}
                        className={`w-full px-3 py-3 rounded font-mono text-sm text-center transition-colors ${cellStyle(cell)}`}
                        title={`${cell.value} of ${cell.threshold}`}
                      >
                        {showMeasure(cell.value)}
                        <span className="block text-[9px] opacity-60">
                          / {showMeasure(cell.threshold)}
                        </span>
                        {/* CONTINUOUS, because a ratio is. Clamped at the line so a breach
                            does not draw outside its own cell — the overflow is already said
                            by the colour and by `over_threshold`, which is the payload's
                            claim and not this bar's. */}
                        <span className="mt-1 block h-0.5 w-full rounded-sm bg-slate-100/10">
                          <span
                            className={`block h-full rounded-sm ${
                              cell.over_threshold ? "bg-rose-300/80" : "bg-current opacity-60"
                            }`}
                            style={{
                              width: `${
                                cell.threshold > 0
                                  ? Math.max(0, Math.min(1, cell.value / cell.threshold)) * 100
                                  : 0
                              }%`,
                            }}
                          />
                        </span>
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHAT THE MARKS MEAN, said once rather than inferred five times.
          A grid of coloured rectangles is unreadable to anyone who did not build it, and the
          reader most likely to be looking at it is the one who did not. The wording names the
          MEASUREMENT, never the domain — this component does not know it is about sites. */}
      <p className="mt-2 font-mono text-[9px] text-slate-500 flex items-center gap-3 flex-wrap">
        <span>bar = value ÷ threshold</span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-slate-500/40" /> under
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-amber-500/50" /> near
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-sm bg-rose-500/60" /> over
        </span>
      </p>

      {/* WHY a cell is what it is. The contributors are the actionable half — "Site B is over"
          sends someone to open a schedule; "over, because P8 + P12 + P13 overlap" does not. */}
      {selected && (
        <CellInspector
          onDismiss={() => setSelected(null)}
          title={<>{names.get(selected.subject_id)} · {selected.period}</>}
          headline={
            <>
              {selected.value} of {selected.threshold}
              {selected.over_threshold && (
                <span className="text-rose-400">
                  {" "}· over by {(selected.value - selected.threshold).toFixed(2)}
                </span>
              )}
            </>
          }
          lines={[
            selected.contributors?.length ? (
              <>from {selected.contributors.join(", ")}</>
            ) : (
              // The actionable half is the contributors — "Site B is over" sends someone to
              // open a schedule; "over, because P8 + P12 + P13 overlap" does not. Their
              // absence is stated rather than left as a blank space.
              <span className="text-slate-600">no contributors recorded</span>
            ),
          ]}
        />
      )}

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
