/**
 * IngestStatusCard — one ingest's progress, keyed by `row.ingest_id`.
 *
 * ⛔ DOES NOT REUSE StepLadder OR IntervalTimeline — re-checked again for this revision and
 * still unsuited (StepLadder requires a monetary `amount` per row; IntervalTimeline requires a
 * `group_kind` of "initiative"/"capability"/"target" and a live drag-to-reschedule commit). The
 * stage ladder below (`ingestStageLadder`, `src/lib/ingestWire.ts`) is a bespoke list drawn from
 * the real, closed `STAGES` tuple (producer 0f48fe2f).
 *
 * ── ONE ROW, ONE FETCH — AND A SEPARATE STORE LOOKUP FOR REVIEW ───────────────────────────
 *
 * `GET /ingest/{id}/status` returns the whole row in one shot; there is no second envelope
 * layer. The row itself carries NO TASK, though — review is an ordinary `document_promotion`
 * HumanTask found among what this app already tracks in `useHumanTaskStore`, matched by
 * `promotionIngestId(row)` against each pending task's `payload.ingest_id`. THE BRIDGE IS GONE
 * as of 0f48fe2f — the row's own `ingest_id` is already `sha256:`-prefixed, so
 * `promotionIngestId` is an identity read now; see its doc comment in `src/lib/ingestWire.ts`.
 *
 * `duplicate` is OUT-OF-BAND: no ladder is drawn for it at all, and no review lookup either — a
 * duplicate never reaches `awaiting_disposition`.
 *
 * Verbs are drawn from the served `document_promotion` declaration
 * (`useTaskKindStore().declarationFor("document_promotion")`) when the app has one, falling back
 * to `policy/task_kinds/document_promotion.yaml`'s own static `accepts`/`reason_required`
 * otherwise — the same served-menu-then-fallback shape `ApprovalTaskCard` uses.
 *
 * A refusal acting on the task (`promotion.act`'s `PromotionRefused` — `ingest_node_absent` →
 * 409, `promotion_store_unavailable`/`promotion_store_unconfigured` → 503, each a
 * `{error, task_id, message}` detail) is read via `readActRefusal` and drawn as
 * `Refused (<error>): <message>` with `data-ingest-act-refusal="<error>"`, naming this document's
 * ingest_id. The task is NEVER rendered as done on a refusal — it stays exactly as pending as it
 * was before the press, and there is NO automatic retry: the button stays available for a
 * deliberate retry only.
 *
 * Polling stops per `ingestPollingDone`: a duplicate, or `promoted`/`rejected`/`failed`.
 * `awaiting_disposition` keeps polling. A 404 (existence-oracle-safe "not found, or not yours")
 * also stops polling, distinctly from a transient transport error, which is tolerated and
 * retried.
 */
import { useEffect, useRef, useState } from "react";
import { actOnHumanTask } from "@/api/client";
import { fetchIngestStatus } from "@/lib/ingestTransport";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import {
  readIngestStatusRow,
  readActRefusal,
  isIngestNotFoundError,
  ingestStageLadder,
  ingestPollingDone,
  promotionIngestId,
  payloadMatchesIngestId,
  type IngestStatusRow,
  type IngestStage,
} from "@/lib/ingestWire";

const RUNG_GLYPH: Record<string, string> = {
  done: "●",
  current: "◐",
  pending: "○",
};

/** `policy/task_kinds/document_promotion.yaml`'s own static declaration — used only when the
 *  served menu (`useTaskKindStore`) has nothing for "document_promotion" yet. */
const FALLBACK_ACCEPTS = ["promoted", "rejected"];
const FALLBACK_REASON_REQUIRED = new Set(["rejected"]);

export interface IngestStatusCardProps {
  ingestId: string;
  /** Injectable so tests need not wait on a real 2s cadence. */
  pollIntervalMs?: number;
  /** Seed row — avoids a redundant first fetch right after upload, and lets tests render a
   *  specific status synchronously. */
  initialRow?: IngestStatusRow;
}

export function IngestStatusCard({ ingestId, pollIntervalMs = 2000, initialRow }: IngestStatusCardProps) {
  const [row, setRow] = useState<IngestStatusRow | null>(initialRow ?? null);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const tasks = useHumanTaskStore((s) => s.tasks);
  const declarationFor = useTaskKindStore((s) => s.declarationFor);

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const raw = await fetchIngestStatus(ingestId);
        if (cancelled) return;
        const next = readIngestStatusRow(raw);
        if (next) setRow(next);
      } catch (err) {
        if (cancelled) return;
        if (isIngestNotFoundError(err)) {
          setNotFound(true);
          if (timerRef.current) clearInterval(timerRef.current);
        }
        // Any other transport error is tolerated and retried on the next tick.
      }
    };

    if (!initialRow) void poll();

    timerRef.current = setInterval(() => {
      setRow((current) => {
        if (current && ingestPollingDone(current)) {
          if (timerRef.current) clearInterval(timerRef.current);
          return current;
        }
        void poll();
        return current;
      });
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestId, pollIntervalMs]);

  if (notFound) {
    return (
      <div className="glass-panel p-4 my-2 border-rose-500/30" data-ingest-id={ingestId}>
        <p className="text-[10px] font-mono text-rose-400" data-ingest-not-found>
          Not found, or not visible to you.
        </p>
      </div>
    );
  }

  if (!row) {
    return (
      <div className="glass-panel p-4 my-2 border-slate-600/30" data-ingest-id={ingestId}>
        <p className="text-[10px] font-mono text-slate-500">loading…</p>
      </div>
    );
  }

  const isDuplicate = row.duplicate !== null;

  const reviewTask = isDuplicate
    ? null
    : tasks.find(
        (t) =>
          t.kind === "document_promotion" &&
          t.status === "pending" &&
          payloadMatchesIngestId(t.payload, promotionIngestId(row)),
      ) ?? null;

  const decl = declarationFor("document_promotion");
  const verbs = decl ? decl.accepts : FALLBACK_ACCEPTS;
  const needsReason = (v: string) => (decl ? decl.reasonRequired.has(v) : FALLBACK_REASON_REQUIRED.has(v));

  const handleAct = async (verb: string) => {
    if (!reviewTask) return;
    setActing(verb);
    setActionError(null);
    setActionErrorCode(null);
    try {
      await actOnHumanTask(reviewTask.taskId, verb, reason.trim());
    } catch (err) {
      // A refusal (e.g. 409 ingest_node_absent, 503 promotion_store_unavailable) is shown; the
      // task is never rendered as done — nothing about `reviewTask` changes here, and there is NO
      // automatic retry: the button stays available, but only for a deliberate press.
      const refusal = readActRefusal(err);
      setActionError(
        refusal ? `Refused (${refusal.error}): ${refusal.message} — ingest ${row.ingest_id}` : "Action failed.",
      );
      setActionErrorCode(refusal?.error ?? null);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="glass-panel p-4 my-2 border-cyan-500/20" data-ingest-id={row.ingest_id}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm text-slate-100 font-mono truncate">{row.ingest_id}</p>
        {row.stage && (
          <span
            className="text-[9px] font-mono uppercase tracking-widest text-cyan-400/70"
            data-ingest-status={row.stage}
          >
            {row.stage}
          </span>
        )}
      </div>

      {isDuplicate ? (
        <p className="mt-2 text-[11px] font-mono text-amber-400" data-ingest-duplicate>
          {row.duplicate!.message}
          <span> (duplicate of {row.duplicate!.of_ingest_id})</span>
          {row.stage && <span> — original is at {row.stage}</span>}
        </p>
      ) : (
        <>
          <ul className="flex items-center gap-2" data-ingest-ladder>
            {ingestStageLadder(row.stage as IngestStage).map((rung) => (
              <li
                key={rung.stage}
                className="flex items-center gap-1 text-[10px] font-mono text-slate-300"
                data-ingest-ladder-stage={rung.stage}
                data-ingest-ladder-state={rung.state}
              >
                <span className={rung.stage === "rejected" || rung.stage === "failed" ? "text-amber-400" : undefined}>
                  {RUNG_GLYPH[rung.state]}
                </span>
                <span>{rung.stage}</span>
              </li>
            ))}
          </ul>

          {(row.stage === "rejected" || row.stage === "failed") && row.detail && (
            <p className="mt-2 text-[11px] font-mono text-amber-400" data-ingest-detail>
              {row.detail}
            </p>
          )}

          {reviewTask ? (
            <div className="mt-3 flex flex-col gap-2" data-ingest-review>
              {actionError && (
                <p
                  className="text-[10px] font-mono text-rose-400"
                  data-ingest-act-error
                  data-ingest-act-refusal={actionErrorCode ?? undefined}
                >
                  {actionError}
                </p>
              )}
              {verbs.some(needsReason) && (
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="reason — required for some decisions below"
                  data-ingest-reason-input
                  className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
                />
              )}
              <div className="flex gap-2">
                {verbs.map((verb) => {
                  const blocked = needsReason(verb) && !reason.trim();
                  return (
                    <button
                      key={verb}
                      type="button"
                      data-ingest-verb={verb}
                      disabled={acting === verb || blocked}
                      title={blocked ? `${verb} requires a reason` : undefined}
                      className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-cyan-600/30 text-cyan-200 disabled:opacity-40"
                      onClick={() => void handleAct(verb)}
                    >
                      {verb}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="mt-3 text-[10px] font-mono text-slate-500" data-ingest-no-review-task>
              no review task visible to you
            </p>
          )}
        </>
      )}
    </div>
  );
}
