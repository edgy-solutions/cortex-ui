import React from "react";
import type { InstancesByPropertyPayload, IbpColumn } from "./types";

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

export const InstancesByPropertyView: React.FC<{
  payload: InstancesByPropertyPayload;
  /** Optional: a tab click asks the host to re-query for that filter value.
   *  Omitted in the mock/standalone render — tabs are then display-only. */
  onSelectFilter?: (value: string) => void;
}> = ({ payload, onSelectFilter }) => {
  const { title, columns, rows, target, row_identity, state_vocabulary } = payload;
  const identityKey = row_identity?.key;
  const activeFilter = target?.filter_value;

  const renderCell = (col: IbpColumn, row: Record<string, string>) => {
    const raw = row[col.key];
    if (raw === undefined || raw === null || raw === "") {
      return <span className="text-slate-600">{EMPTY_CELL}</span>;
    }
    // Row-identity column with an IRI + local-name display: show the short form,
    // keep the full IRI as the title (identity stays the IRI).
    if (col.key === identityKey && row_identity?.iri && row_identity?.display_from_local_name) {
      return (
        <span className="font-semibold font-mono text-sm text-slate-100" title={raw}>
          {localName(raw)}
        </span>
      );
    }
    return <span className="font-mono text-sm text-slate-300">{raw}</span>;
  };

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
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
                    className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/70"
                  >
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((row, i) => (
                <tr
                  key={(identityKey && row[identityKey]) || i}
                  className="hover:bg-cyan-500/[0.04] transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-3 align-top">
                      {renderCell(col, row)}
                    </td>
                  ))}
                </tr>
              ))}
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
