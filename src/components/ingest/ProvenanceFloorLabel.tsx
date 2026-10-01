/**
 * ProvenanceFloorLabel — ADR-0041 §7's "the label rides the answer," drawn at COMPONENT level.
 * Renamed from the earlier `UnvouchedLabel` by the 2026-09-30 dispatch: the field is
 * `provenance_floor` now, shaped `{obtained_via, ingest_ids}` — no `label` on the wire any
 * more, so the warning text is fixed here (`PROVENANCE_FLOOR_WARNING_LABEL`), never inferred
 * from anything else.
 *
 * Two draws, decided by `provenanceFloorIsUnverified` — `ingest_ids` AND `unidentified`, never
 * ids alone (lane/74 `ead2f80d`: an unidentified drop has no id to list, and must not vanish):
 *   - unverified → the warning banner (`data-provenance-floor-unverified`), listing each id and
 *     the unidentified count (`data-provenance-floor-unidentified`).
 *   - otherwise  → a quiet rung chip (`data-provenance-floor="<rung>"`), no warning —
 *     the floor is known and worth showing, but nothing here is actually unvouched-for.
 *
 * Wired into SemanticInterpreter's render loop above EVERY archetype's own rendering, so the
 * label is archetype-agnostic by construction rather than added case by case.
 */
import {
  readProvenanceFloor,
  provenanceFloorIsUnverified,
  PROVENANCE_FLOOR_WARNING_LABEL,
} from "@/lib/ingestWire";

export function ProvenanceFloorLabel({ component }: { component: unknown }) {
  const floor = readProvenanceFloor(component);
  if (!floor) return null;

  if (!provenanceFloorIsUnverified(floor)) {
    return (
      <span
        className="inline-block text-[9px] font-mono uppercase tracking-wider text-slate-400/80 border border-slate-600/30 rounded px-1.5 py-0.5 mb-2"
        data-provenance-floor={floor.obtained_via}
      >
        {floor.obtained_via}
      </span>
    );
  }

  return (
    <div
      className="glass-panel-sm p-2 mb-2 border-amber-500/30 bg-amber-500/5"
      data-provenance-floor-unverified
    >
      <p className="text-[9px] font-mono uppercase tracking-wider text-amber-400/90">
        {PROVENANCE_FLOOR_WARNING_LABEL}
      </p>
      <ul className="mt-1 flex flex-col gap-0.5">
        {floor.ingest_ids.map((id) => (
          <li
            key={id}
            className="text-[10px] font-mono text-amber-300/80"
            data-provenance-floor-ingest-id={id}
          >
            {id}
          </li>
        ))}
      </ul>
      {floor.unidentified > 0 && (
        <p
          className="mt-1 text-[10px] font-mono text-amber-300/80"
          data-provenance-floor-unidentified={floor.unidentified}
        >
          {floor.unidentified} unidentified {floor.unidentified === 1 ? "source" : "sources"} — no ingest id to name
        </p>
      )}
    </div>
  );
}
