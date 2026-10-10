/**
 * IngestKindSuggestion — ADR-0041 §4: "the classifier suggests, the human confirms, the manifest
 * declares". After doc-tools reads the document the classifier may suggest a registered LEAF
 * content kind (e.g. `pcn`); the dropper confirms it here, on the ingest turn. This is a step
 * AFTER, and separate from, the pre-send pdf/cad/xml file-format picker on the chip.
 *
 * The wire is PROPOSED to Lane 1 (packet
 * `sessions/2026-10-09-packet-to-lane-1-leaf-kind-suggestion-and-adr-0041-notes.md`): the status
 * field `suggested_content_kind` and the verb `POST /ingest/{id}/content_kind`. The platform emits
 * neither at invincible-agent origin/master, so today the field is always absent and this renders
 * NOTHING — no placeholder, no empty box.
 */
import { useState } from "react";
import { confirmIngestContentKind } from "@/lib/ingestTransport";
import { readActRefusal, readIngestErrorMessage, type IngestStatusRow } from "@/lib/ingestWire";

const TERMINAL_STAGES: ReadonlySet<string> = new Set(["promoted", "rejected", "failed"]);

type Phase = "idle" | "posting" | "confirmed" | "declined";

export function IngestKindSuggestion({ row }: { row: IngestStatusRow }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const kind = row.suggested_content_kind;
  if (!kind) return null;
  if (row.duplicate !== null) return null;
  if (row.stage === null || TERMINAL_STAGES.has(row.stage)) return null;

  const confirm = async () => {
    setPhase("posting");
    setError(null);
    try {
      await confirmIngestContentKind(row.ingest_id, kind);
      setPhase("confirmed");
    } catch (err) {
      const refusal = readActRefusal(err);
      setError(refusal?.message ?? readIngestErrorMessage(err) ?? "Confirm failed.");
      setPhase("idle");
    }
  };

  if (phase === "declined") {
    return (
      <p className="mt-2 text-[10px] font-mono text-slate-500" data-kind-suggestion={kind} data-kind-declined="">
        Kind not confirmed — the reviewer will see the extraction
      </p>
    );
  }

  const confirmed = phase === "confirmed";
  return (
    <div
      className="mt-2 flex flex-col gap-1"
      data-kind-suggestion={kind}
      {...(confirmed ? { "data-kind-confirmed": "" } : {})}
    >
      <p className="text-[11px] font-mono text-slate-300">
        {confirmed ? "Kind confirmed" : "Classifier suggests"}: <span>{kind.toUpperCase()}</span>
      </p>
      {error && (
        <p className="text-[10px] font-mono text-rose-400" role="alert" data-kind-suggestion-error>
          {error}
        </p>
      )}
      {!confirmed && (
        <div className="flex gap-2">
          <button
            type="button"
            data-kind-verb="confirm"
            disabled={phase === "posting"}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40"
            onClick={() => void confirm()}
          >
            Confirm
          </button>
          <button
            type="button"
            data-kind-verb="decline"
            disabled={phase === "posting"}
            className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-white/5 text-slate-300 disabled:opacity-40"
            onClick={() => setPhase("declined")}
          >
            Not this
          </button>
        </div>
      )}
    </div>
  );
}
