import { arr, num, rec, str, strList } from "./readers";

/**
 * FAILURE_RECORD_SET — drawn from the safety engine's flat `what_failed_on_this_part` reply
 * (`output_uri` .../safety#FailureRecordSet). Records are listed by date, each with its source ref.
 */
export function FailureRecordSetCard({ payload }: { payload: Record<string, unknown> }) {
  const failures = arr(payload.failures).map(rec).filter((f): f is Record<string, unknown> => !!f);
  const declared = num(payload.failure_count);
  const checked = num(payload.critical_items_checked);
  const subline = [
    strList(payload.platforms).join(", "),
    strList(payload.systems_of_record_cited).join(", "),
    checked !== undefined ? `checked against ${checked} critical items` : "",
  ].filter((x) => x !== "");
  const modes = arr(payload.rows).map(rec).filter((r): r is Record<string, unknown> => !!r);
  const note = str(payload.note);

  const sorted = [...failures].sort((a, b) => {
    const da = str(a.observed_on);
    const db = str(b.observed_on);
    if (da === undefined && db !== undefined) return 1;
    if (da !== undefined && db === undefined) return -1;
    if (da !== undefined && db !== undefined && da !== db) return da < db ? -1 : 1;
    const ia = str(a.record_id) ?? "";
    const ib = str(b.record_id) ?? "";
    return ia < ib ? -1 : ia > ib ? 1 : 0;
  });

  return (
    <div data-render="FAILURE_RECORD_SET" className="glass-panel p-4 my-2 space-y-3 font-mono text-xs text-slate-200">
      <div data-frs-header>
        <div className="text-base font-bold text-white">
          {`part ${str(payload.part_number) ?? ""} · ${declared ?? failures.length} failures`}
        </div>
        {subline.length > 0 && <div className="text-[10px] text-slate-400">{subline.join(" · ")}</div>}
      </div>

      {declared !== undefined && failures.length !== declared && (
        <div data-frs-count-mismatch className="text-[10px] text-amber-400">
          {`${failures.length} of ${declared} records arrived`}
        </div>
      )}

      <ul data-frs-modes className="text-[11px]">
        {modes.map((r, i) => (
          <li key={`${str(r.entity_name) ?? "mode"}-${i}`}>{`${str(r.entity_name) ?? ""} (${num(r.contribution) ?? ""})`}</li>
        ))}
      </ul>

      <table data-frs-records className="w-full text-[11px]">
        <thead>
          <tr className="text-left text-[10px] text-slate-500">
            <th className="pr-3 font-normal">observed on</th>
            <th className="pr-3 font-normal">failure mode</th>
            <th className="pr-3 font-normal">platform</th>
            <th className="pr-3 font-normal">record</th>
            <th className="font-normal">source</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((f, i) => (
            <tr key={`${str(f.record_id) ?? "r"}-${i}`} data-frs-record={str(f.record_id)}>
              <td className="pr-3">{str(f.observed_on) ?? "date not recorded"}</td>
              <td className="pr-3">{str(f.failure_mode)}</td>
              <td className="pr-3">{str(f.platform)}</td>
              <td className="pr-3">{str(f.record_id)}</td>
              <td data-frs-source className="text-slate-400">
                {[str(f.system_of_record), str(f.citation)].filter(Boolean).join(" · ")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {note && (
        <div data-frs-note className="text-[10px] text-slate-400">
          {note}
        </div>
      )}
    </div>
  );
}
