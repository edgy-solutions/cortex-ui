/**
 * KindPicker — pick a kind from the closed, deterministic `INGEST_KINDS` set.
 *
 * `POST /ingest` (invincible-agent origin/master, 0f48fe2f, live on helm rev 162) requires `kind` as an ORDINARY
 * REQUIRED multipart field — there is no `GET /ingest/kinds` route and no classifier
 * suggestion; `ingest_status.py`'s `KINDS` tuple is the whole menu, ADR-0021's precedence
 * ("never LLM-classified") holds exactly as it did for the proposed wire, just with a smaller,
 * fixed menu instead of a registered/fetched one.
 *
 * `suggestedKind` pre-selects ONLY when it names a value actually in `INGEST_KINDS` — kept as a
 * prop, with its own tests below, because a future producer-side suggestion is the kind of
 * addition that should slot into this component rather than need a second one. NOTHING ON THE
 * REAL TRANSPORT SUPPLIES ONE TODAY: `IngestPanel` never passes `suggestedKind`, so in practice
 * nothing is ever pre-selected and confirm starts disabled until a human picks.
 *
 * `blockedReason`, when non-null, disables confirm regardless of selection and shows the reason
 * — the no-`on_behalf_of`-email case (`IngestPanel`), where sending the upload at all would be
 * wrong rather than merely premature.
 */
import { useState } from "react";
import { INGEST_KINDS, type IngestKind } from "@/lib/ingestWire";

export interface KindPickerProps {
  suggestedKind?: string | null;
  onConfirm: (kind: IngestKind) => void;
  confirming?: boolean;
  blockedReason?: string | null;
}

export function KindPicker({ suggestedKind = null, onConfirm, confirming, blockedReason }: KindPickerProps) {
  const suggestionValid =
    suggestedKind !== null && (INGEST_KINDS as readonly string[]).includes(suggestedKind);
  const [selected, setSelected] = useState<IngestKind | null>(
    suggestionValid ? (suggestedKind as IngestKind) : null,
  );

  return (
    <div className="glass-panel p-4 my-2 border-cyan-500/20" data-kind-picker>
      <p className="text-[10px] font-mono uppercase tracking-widest text-cyan-400/70 mb-2">
        What kind of document is this?
      </p>
      <div className="flex flex-col gap-1" role="radiogroup">
        {INGEST_KINDS.map((k) => (
          <label
            key={k}
            className="flex items-center gap-2 text-sm text-slate-200 cursor-pointer py-1"
            data-ingest-kind={k}
          >
            <input
              type="radio"
              name="ingest-kind"
              value={k}
              checked={selected === k}
              onChange={() => setSelected(k)}
            />
            {k}
          </label>
        ))}
      </div>
      {blockedReason && (
        <p className="mt-2 text-[10px] font-mono text-amber-400" data-ingest-kind-blocked>
          {blockedReason}
        </p>
      )}
      <button
        type="button"
        className="mt-3 px-3 py-1 text-xs font-mono uppercase tracking-wider rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40 disabled:cursor-not-allowed"
        data-ingest-kind-confirm
        disabled={!selected || !!confirming || !!blockedReason}
        onClick={() => selected && onConfirm(selected)}
      >
        {confirming ? "Confirming…" : "Confirm"}
      </button>
    </div>
  );
}
