/**
 * IngestFailureExtras — what a drop's `failure` adds beside its reason line, shared by the rail
 * entry (AnswersPanel) and IngestStatusCard so the two cannot drift:
 *
 *  - the producer's `reason_code`, verbatim (open vocabulary), `data-ingest-reason-code`;
 *  - `attempt {n}` once a drop has been retried (n > 1), `data-ingest-attempt`;
 *  - for `timeout`, one muted line saying the row can still advance on its own;
 *  - a Retry button, ONLY at stage `failed` (Lane 1 packet
 *    `sessions/2026-10-12-packet-to-cortex-the-failure-field-is-failure-on-ingest-status-a-failed-drop-is-retryable.md` §2).
 *
 * It claims nothing beyond the row's own stage: a retried row is `received` again and is drawn so.
 */
import { useState, type MouseEvent } from "react";
import { INGEST_FAILURE_TIMEOUT } from "@/lib/ingestWire";

export const INGEST_TIMEOUT_NOTE = "No stage was reported in time. It can still advance on its own.";

export interface IngestFailureExtrasProps {
  /** The row's stage / badge; the Retry button is drawn only for `failed`. */
  stage: string;
  ingestId: string | null;
  reasonCode: string | null;
  attempt: number | null;
  retry: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
}

export function IngestFailureExtras({ stage, ingestId, reasonCode, attempt, retry }: IngestFailureExtrasProps) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const failed = stage === "failed";

  const onClick = async (e: MouseEvent) => {
    e.stopPropagation();
    if (busy || ingestId === null) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await retry(ingestId);
      if (!r.ok) setMessage(r.message);
    } catch {
      setMessage("Retry failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {(reasonCode !== null || (attempt !== null && attempt > 1) || failed) && (
        <span className="inline-flex flex-wrap items-center gap-1.5 mt-0.5">
          {reasonCode !== null && (
            <span
              className="px-1 py-px rounded text-[9px] font-mono text-amber-300 border border-amber-400/40 bg-amber-400/10"
              data-ingest-reason-code
            >
              {reasonCode}
            </span>
          )}
          {attempt !== null && attempt > 1 && (
            <span className="text-[9px] font-mono text-slate-400" data-ingest-attempt>
              attempt {attempt}
            </span>
          )}
          {failed && ingestId !== null && (
            <button
              type="button"
              disabled={busy}
              onClick={onClick}
              data-ingest-retry
              className="px-1.5 py-px rounded text-[9px] font-mono text-amber-300 border border-amber-400/40 hover:bg-amber-400/10 disabled:opacity-50"
            >
              Retry
            </button>
          )}
        </span>
      )}
      {failed && reasonCode === INGEST_FAILURE_TIMEOUT && (
        <p className="text-[10px] font-mono text-slate-500 leading-snug mt-0.5" data-ingest-timeout-note>
          {INGEST_TIMEOUT_NOTE}
        </p>
      )}
      {message !== null && (
        <p className="text-[10px] font-mono text-amber-400 leading-snug mt-0.5" role="alert" data-ingest-retry-message>
          {message}
        </p>
      )}
    </>
  );
}
