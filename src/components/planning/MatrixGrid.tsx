/**
 * MATRIX_GRID — rows × columns of a level against a per-cell target.
 *
 * A LIVE VIEW (ADR-0042). Content replaced wholesale on re-evaluation; the freshness stamp is
 * per evaluation.
 *
 * THE RAMP READS AS PROGRESS, NOT DANGER — which is the whole reason this is not
 * THRESHOLD_GRID. A threshold breach is a problem; a maturity gap is a distance still to
 * travel, and colouring it red would tell a room that every capability short of target is
 * failing. Attainment (level/target) drives the ramp, and the palette runs cool-to-warm
 * rather than safe-to-danger.
 *
 * IT KNOWS NO DOMAIN. "Capability", "maturity", "site" appear nowhere; the payload supplies
 * `level_label` and the axis names.
 */
import { showMeasure } from "@/lib/showMeasure";
import { useState } from "react";
import {
  matrixAxes, validateMatrixGrid, type MatrixCell,
} from "./MatrixGrid.contract";

export interface MatrixGridProps {
  rows: unknown;
  level_label?: string;
  scope_label?: string;
  /** The as-of the caller asked for. Rendered, because a level with no date has no shelf life. */
  as_of?: string;
  valid_as_of?: string;
  state_version?: number;
}

function cellStyle(cell: MatrixCell): string {
  const attainment = cell.target_level > 0 ? cell.level / cell.target_level : 0;
  if (attainment >= 1) return "bg-emerald-500/25 text-emerald-100 ring-1 ring-emerald-400/40";
  if (attainment >= 0.75) return "bg-cyan-500/20 text-cyan-100";
  if (attainment >= 0.5) return "bg-sky-500/15 text-sky-100";
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

export function MatrixGrid({
  rows, level_label, scope_label, as_of, valid_as_of, state_version,
}: MatrixGridProps) {
  const [selected, setSelected] = useState<MatrixCell | null>(null);
  const result = validateMatrixGrid(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const cells = result.cells;
  const { rows: rowIds, columns } = matrixAxes(cells);
  const at = (r: string, c: string) =>
    cells.find((x) => x.row_id === r && x.column_id === c) ?? null;
  const rowNames = new Map(cells.map((c) => [c.row_id, c.row_name || c.row_id]));
  const colNames = new Map(cells.map((c) => [c.column_id, c.column_name || c.column_id]));
  const atTarget = cells.filter((c) => c.gap <= 0).length;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Matrix"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {rowIds.length} × {columns.length} · {atTarget} of {cells.length} at target
          {level_label && <span className="text-slate-400"> · {level_label}</span>}
          {as_of && <span className="text-slate-400"> · as of {as_of}</span>}
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left border-separate border-spacing-1">
          <thead>
            <tr>
              <th className="px-3 py-2" />
              {columns.map((c) => (
                <th key={c} className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 text-center whitespace-nowrap">
                  {colNames.get(c)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowIds.map((r) => (
              <tr key={r}>
                <td className="px-3 py-2 font-mono text-sm text-slate-100 whitespace-nowrap">
                  {rowNames.get(r)}
                </td>
                {columns.map((c) => {
                  const cell = at(r, c);
                  if (!cell) {
                    // NEVER ASSESSED. Not level 0 — "we have never measured this" and "we
                    // measured this at zero" have different next actions, and a grid that
                    // renders both the same has destroyed the distinction.
                    return (
                      <td key={c} className="px-3 py-3 text-center" title="never assessed">
                        <span className="font-mono text-[11px] text-slate-700">—</span>
                      </td>
                    );
                  }
                  return (
                    <td key={c} className="p-0">
                      <button
                        type="button"
                        onClick={() => setSelected(cell)}
                        className={`w-full px-3 py-3 rounded font-mono text-sm text-center transition-colors ${cellStyle(cell)}`}
                        title={`${cell.level} of ${cell.target_level}`}
                      >
                        {showMeasure(cell.level)}
                        <span className="block text-[9px] opacity-60">
                          / {showMeasure(cell.target_level)}
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

      {selected && (
        <div className="mt-4 p-3 rounded glass-panel-sm border-cyan-500/20">
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyan-400/70 mb-1">
            {rowNames.get(selected.row_id)} · {colNames.get(selected.column_id)}
          </p>
          <p className="font-mono text-sm text-slate-200">
            level {selected.level} of {selected.target_level}
            {selected.gap > 0
              ? <span className="text-sky-300"> · {selected.gap} to go</span>
              : <span className="text-emerald-300"> · at target</span>}
          </p>
          {/* PROVENANCE, not decoration. A level with no as-of is a number with no shelf life,
              and a room reading a two-year-old assessment as current is the failure the
              append-only history exists to prevent. */}
          <p className="mt-1 font-mono text-[11px] text-slate-400">
            {selected.assessed_at
              ? <>assessed {selected.assessed_at}{selected.assessed_by ? ` by ${selected.assessed_by}` : ""}</>
              : <span className="text-slate-600">no assessment date recorded</span>}
            {typeof selected.assessment_count === "number" && (
              <span className="text-slate-600">
                {" "}· {selected.assessment_count === 1
                  ? "first assessment — no trajectory yet"
                  : `${selected.assessment_count} assessments`}
              </span>
            )}
          </p>
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
