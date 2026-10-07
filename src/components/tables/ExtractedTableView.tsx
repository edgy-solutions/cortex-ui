/**
 * DOORS export viewer — one extracted table drawn as one artifact.
 *
 * INERT. Mounted nowhere: no route, no fetch, no archetype id reads this
 * file. The archetype name and the served envelope are Lane 1's to declare
 * (see `src/lib/extractedTable.ts`). Precedent: `d3cfff6`, the illustration
 * viewer, "inert until served".
 *
 * No raw-HTML DOM write of any kind — the grid from `parseTableHtml` is
 * plain data (`Cell[][]`); this component only ever renders `cell.text` as
 * React text content. (Seal 7 scans this file's text for the forbidden APIs
 * by name — so this comment deliberately does not spell them, to keep that
 * scan honest.)
 */
import { ABSENT_MARK } from "@/lib/cardExport";
import { parseTableHtml, type ExtractedTableRecord } from "@/lib/extractedTable";

export interface ExtractedTableViewProps {
  record: ExtractedTableRecord;
  document?: { label: string; ref?: string | null } | null;
}

function Absent() {
  return <span className="text-rose-300/80 italic">{ABSENT_MARK}</span>;
}

const HEAD_CELL_CLASS =
  "px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-white/5";
const BODY_CELL_CLASS = "px-4 py-3 text-[11px] text-slate-300 border-b border-white/5 whitespace-nowrap";

export function ExtractedTableView({ record, document }: ExtractedTableViewProps) {
  const grid = record.text_as_html ? parseTableHtml(record.text_as_html) : null;

  return (
    <div
      className="max-w-full glass-panel border-neon-blue/30 overflow-hidden relative"
      data-extracted-table-view=""
      // Never start a canvas drag from this card; there is no interactive child to
      // single out, so the stop is at the root.
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10 bg-white/5">
        <span className="font-mono text-[10px] font-bold text-slate-300 tracking-widest uppercase truncate">
          {document?.label ? document.label : <Absent />}
        </span>
        <span className="font-mono text-[10px] text-slate-400 shrink-0">
          {record.page_number !== null ? `p. ${record.page_number}` : <Absent />}
        </span>
        <span
          className="font-mono text-[10px] text-slate-500 shrink-0"
          data-table-element-id={record.element_id}
        >
          {record.element_id}
        </span>
      </div>

      {grid ? (
        <div className="overflow-x-auto font-mono" data-extracted-table="structured">
          <table className="w-full text-left border-collapse">
            {grid.head.length > 0 && (
              <thead>
                {grid.head.map((row, ri) => (
                  <tr key={`h-${ri}`} className="bg-slate-900/50">
                    {row.map((cell, ci) => (
                      <th key={`h-${ri}-${ci}`} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={HEAD_CELL_CLASS}>
                        {cell.text}
                      </th>
                    ))}
                  </tr>
                ))}
              </thead>
            )}
            <tbody className="divide-y divide-white/5">
              {grid.body.map((row, ri) => (
                <tr key={`b-${ri}`}>
                  {row.map((cell, ci) =>
                    cell.header ? (
                      <th key={`b-${ri}-${ci}`} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={HEAD_CELL_CLASS}>
                        {cell.text}
                      </th>
                    ) : (
                      <td key={`b-${ri}-${ci}`} colSpan={cell.colSpan} rowSpan={cell.rowSpan} className={BODY_CELL_CLASS}>
                        {cell.text}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-3 font-mono text-[11px] text-slate-400" data-extracted-table="unstructured">
          {/* Mirrors doc-tools' own fallback — doc_tools/utils/formatters, exercised by
              tests/test_formatters.py test_table_without_html_marks_structure_unavailable. */}
          <p>Structure unavailable — raw extracted text:</p>
          <pre className="whitespace-pre-wrap">{record.text}</pre>
        </div>
      )}

      {record.bbox !== null && (
        <div className="px-4 py-2 border-t border-white/5 text-[9px] text-slate-500">
          bbox [{record.bbox.join(", ")}] · page {record.page_width ?? ABSENT_MARK}×{record.page_height ?? ABSENT_MARK}
        </div>
      )}
    </div>
  );
}
