/**
 * THRESHOLD_GRID — subjects × periods, each cell against a threshold that subject owns.
 *
 * A LIVE VIEW (ADR-0042). Content is replaced wholesale on re-evaluation; the freshness stamp
 * is the one THIS evaluation carried, never the mint-time one.
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
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* WHY a cell is what it is. The contributors are the actionable half — "Site B is over"
          sends someone to open a schedule; "over, because P8 + P12 + P13 overlap" does not. */}
      {selected && (
        <div className="mt-4 p-3 rounded glass-panel-sm border-cyan-500/20">
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 mb-1">
            {names.get(selected.subject_id)} · {selected.period}
          </p>
          <p className="font-mono text-sm text-slate-200">
            {selected.value} of {selected.threshold}
            {selected.over_threshold && (
              <span className="text-rose-400">
                {" "}· over by {(selected.value - selected.threshold).toFixed(2)}
              </span>
            )}
          </p>
          {selected.contributors?.length ? (
            <p className="mt-1 font-mono text-[11px] text-slate-400">
              from {selected.contributors.join(", ")}
            </p>
          ) : (
            <p className="mt-1 font-mono text-[11px] text-slate-600">no contributors recorded</p>
          )}
        </div>
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
