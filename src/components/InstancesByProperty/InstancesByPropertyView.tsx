import React from "react";
import type { InstancesByPropertyPayload, IbpColumn, IbpCell, IbpRow } from "./types";
import { bounded } from "@/lib/boundedWarning";

/**
 * INSTANCES_BY_PROPERTY renderer — GENERIC by construction.
 *
 * Draws `columns` as headers, `rows` as cells, `state_vocabulary` as filter
 * tabs (the active one is `target.filter_value`), and uses `row_identity` to
 * decide which column is the stable key + whether to shorten an IRI to its
 * local name. It knows NOTHING about parts, MPNs, dispositions, or PCN — feed
 * it a datasets-by-domain payload and it draws that table identically. That is
 * the acceptance test (docs/plans/pcn-dashboard-payload-schema.md §Acceptance):
 * generic-by-construction, not PCN-shaped in disguise.
 *
 * Visual shell mirrors SupplyTable (glass-panel, pulsing cyan dot header,
 * footer info row) for consistency with the other archetypes.
 */

/** Last path/hash segment of an IRI — the display form when a column is the
 *  IRI row-identity and the payload asks for local-name display. */
function localName(value: string): string {
  if (!value) return value;
  const cut = Math.max(value.lastIndexOf("/"), value.lastIndexOf("#"));
  return cut >= 0 ? value.slice(cut + 1) : value;
}

const EMPTY_CELL = "—";

/** A missing key, `null`, or "": not stated. A served 0 is a value, never absent. */
const absent = (cell: IbpCell | undefined): cell is null | undefined | "" =>
  cell === undefined || cell === null || cell === "";

/** A cell value: an object under a column key is not a cell value, so it reads as absent. */
const cellOf = (row: IbpRow, key: string): IbpCell | undefined => {
  const v = row[key];
  return v !== null && typeof v === "object" ? undefined : v;
};

/** A tolerant {column key: phrase} map: a non-object or array is {}. Phrases are bounded at lookup. */
const reasonMap = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export const InstancesByPropertyView: React.FC<{
  payload: InstancesByPropertyPayload;
  /** Optional: a tab click asks the host to re-query for that filter value.
   *  Omitted in the mock/standalone render — tabs are then display-only. */
  onSelectFilter?: (value: string) => void;
}> = ({ payload, onSelectFilter }) => {
  const { title, columns, rows, target, row_identity, state_vocabulary, group_by } = payload;
  const envelopeReasons = reasonMap(payload.absent_reason);
  const identityKey = row_identity?.key;
  const activeFilter = target?.filter_value;

  // GROUPING — by whichever column the producer's `group_by` names, in first-appearance order.
  const groupCol = group_by ? columns.find((c) => c.key === group_by) : undefined;
  const groups: { value: IbpCell | undefined; rows: IbpRow[] }[] = [];
  if (groupCol) {
    for (const row of rows) {
      const value = absent(cellOf(row, groupCol.key)) ? undefined : cellOf(row, groupCol.key);
      const g = groups.find((x) => x.value === value);
      if (g) g.rows.push(row);
      else groups.push({ value, rows: [row] });
    }
  }

  const renderCell = (col: IbpColumn, row: IbpRow) => {
    const cell = cellOf(row, col.key);
    if (absent(cell)) {
      // Row before envelope; a phrase that fails the bound counts as missing.
      const why = bounded(reasonMap(row.absent_reason)[col.key]) ?? bounded(envelopeReasons[col.key]);
      if (why !== null) {
        return (
          <span className="text-[10px] leading-tight text-slate-500 italic" data-ibp-absent-reason data-ibp-cell-absent>
            {why}
          </span>
        );
      }
      return (
        <span className="text-slate-600" data-ibp-cell-absent title="not stated">
          {EMPTY_CELL}
        </span>
      );
    }
    const raw = String(cell);
    // Row-identity column with an IRI + local-name display: show the short form,
    // keep the full IRI as the title (identity stays the IRI).
    if (col.key === identityKey && row_identity?.iri && row_identity?.display_from_local_name) {
      return (
        <span className={`font-semibold font-mono text-xs text-slate-100${/\s/.test(localName(raw)) ? "" : " whitespace-nowrap"}`} title={raw}>
          {localName(raw)}
        </span>
      );
    }
    return <span className={`font-mono text-xs text-slate-300${/\s/.test(raw) ? "" : " whitespace-nowrap"}`}>{raw}</span>;
  };

  const drawRow = (row: IbpRow, i: number) => (
    <tr
      key={(identityKey && !absent(cellOf(row, identityKey)) && String(cellOf(row, identityKey))) || i}
      data-ibp-row=""
      className="hover:bg-cyan-500/[0.04] transition-colors"
    >
      {columns.map((col) => (
        <td key={col.key} className="px-2 py-3 align-top">
          {renderCell(col, row)}
        </td>
      ))}
    </tr>
  );

  return (
    <div className="glass-panel p-4 my-4 border-cyan-500/20 relative overflow-hidden">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {title}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {[target?.class, `${rows.length} ${rows.length === 1 ? "instance" : "instances"}`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>

      {/* Filter tabs — the state vocabulary; the active value is highlighted. */}
      {state_vocabulary && state_vocabulary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {state_vocabulary.map((value) => {
            const active = value === activeFilter;
            return (
              <button
                key={value}
                type="button"
                disabled={!onSelectFilter}
                onClick={onSelectFilter ? () => onSelectFilter(value) : undefined}
                className={
                  "px-2.5 py-1 rounded font-mono text-[10px] uppercase tracking-wider border transition-colors " +
                  (active
                    ? "bg-cyan-500/15 text-cyan-200 border-cyan-500/40"
                    : "bg-white/[0.02] text-slate-400 border-white/10 " +
                      (onSelectFilter ? "hover:bg-cyan-500/[0.06] hover:text-cyan-300" : "cursor-default"))
                }
              >
                {value}
              </button>
            );
          })}
        </div>
      )}

      {group_by && !groupCol && (
        <p className="mb-2 font-mono text-[10px] text-amber-400/80" data-ibp-group-by-undeclared>
          grouping by {group_by}: names no column, drawn ungrouped
        </p>
      )}

      {/* Table — headers from columns[], cells from rows[col.key]. */}
      {rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
            No instances
          </p>
          <p className="font-mono text-[9px] text-slate-500">
            {activeFilter ? `none match ${activeFilter}` : "no rows in this view"}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-white/10">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className="px-2 py-2 font-mono text-[10px] uppercase tracking-wider font-semibold text-cyan-400/70"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {groupCol
                ? groups.map((g, gi) => (
                    <React.Fragment key={`g${gi}`}>
                      <tr
                        data-ibp-group={g.value === undefined ? "" : String(g.value)}
                        {...(g.value === undefined ? { "data-ibp-group-absent": "" } : {})}
                        className="bg-white/[0.03]"
                      >
                        <td
                          colSpan={columns.length}
                          className="px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-cyan-300/80"
                        >
                          {groupCol.label}: {g.value === undefined ? EMPTY_CELL : String(g.value)} · {g.rows.length}
                        </td>
                      </tr>
                      {g.rows.map((row, i) => drawRow(row, i))}
                    </React.Fragment>
                  ))
                : rows.map((row, i) => drawRow(row, i))}
            </tbody>
          </table>
        </div>
      )}

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Instances:</span>
          <span>{rows.length}</span>
        </div>
        {target?.filter_property && activeFilter && (
          <div className="flex items-center gap-1">
            <span className="text-cyan-500/50">{localName(target.filter_property)}:</span>
            <span>{activeFilter}</span>
          </div>
        )}
      </div>
    </div>
  );
};
