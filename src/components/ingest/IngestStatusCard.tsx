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
 * duplicate never reaches `review`.
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
 * Where the poll lives: on the answers rail a drop is an entry and this card is its opened body, so
 * the ONE poller is `useIngestStatusStore` and the card, mounted with `fromStore`, only READS it. A
 * card mounted outside the rail (no `fromStore`) keeps its own poll, as below. Never both for one id.
 *
 * Polling stops per `ingestPollingDone`: a duplicate, or `promoted`/`rejected`/`failed` — except a
 * `failed` row with reason_code `timeout`, which a late run can still advance: it is re-read every
 * `INGEST_FAILED_TIMEOUT_POLL_MS` (this card's own poll included). `review` keeps polling. A 404 (existence-oracle-safe "not found, or not yours")
 * also stops polling, distinctly from a transient transport error, which is tolerated and
 * retried.
 */
import { useEffect, useRef, useState } from "react";
import { actOnHumanTask } from "@/api/client";
import { fetchIngestStatus, disputeIngestOrigin, retryIngest } from "@/lib/ingestTransport";
import { fetchCase, type FetchCaseResult } from "@/lib/cases";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { useHumanTaskStore } from "@/store/useHumanTaskStore";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { taskArtifactId } from "@/lib/taskArtifact";
import {
  readIngestStatusRow,
  readActRefusal,
  readIngestErrorMessage,
  isIngestNotFoundError,
  ingestStageLadder,
  ingestEventLadder,
  INGEST_AWAITING_KIND_STATUS,
  INGEST_AWAITING_ORIGIN_STATUS,
  INGEST_CASE_OPENED_STATUS,
  INGEST_REVIEW_REJECTED_STATUS,
  ingestPollingDone,
  INGEST_FAILED_TIMEOUT_POLL_MS,
  INGEST_FAILURE_TIMEOUT,
  readIngestRetryRefusal,
  promotionIngestId,
  payloadMatchesIngestId,
  type IngestStatusRow,
} from "@/lib/ingestWire";
import { IngestFailureExtras } from "./IngestFailureExtras";
import { IngestLeafChip } from "./IngestLeafChip";
import { duplicatePhrase } from "@/lib/ingestWire";
import { originSummary } from "@/lib/ingestOrigin";

const RUNG_GLYPH: Record<string, string> = {
  done: "●",
  current: "◐",
  pending: "○",
};

/** `policy/task_kinds/document_promotion.yaml`'s own static declaration — used only when the
 *  served menu (`useTaskKindStore`) has nothing for "document_promotion" yet. */
const FALLBACK_ACCEPTS = ["promoted", "rejected"];
const FALLBACK_REASON_REQUIRED = new Set(["rejected"]);

/**
 * An EVENT ingest's case — "event ingests render as cases" (ruling, 2026-10-07).
 *
 * The case is fetched (`GET /cases/{case_id}`, `fetchCase`) and drawn THROUGH
 * `SemanticInterpreter` as a `WORKFLOW_CASE` component, never by importing the workflow-case card:
 * the interpreter's dispatch is where every WORKFLOW_CASE answer is drawn (and where its raw
 * fields are disclosed), so a direct import would bypass it. `eventCaseCensus.test.ts` holds that.
 *
 * `not_found` is ONE sentence for two facts — an absent case and a case the caller may not read
 * answer identically BY DESIGN (an existence oracle); this card never splits them.
 */
function EventCase({ caseId }: { caseId: string }) {
  const [result, setResult] = useState<FetchCaseResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    void fetchCase(caseId).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  if (result === null) {
    return (
      <p className="mt-2 text-[10px] font-mono text-slate-500" data-case-state="loading">
        loading case…
      </p>
    );
  }
  if (result.ok) {
    return (
      <div className="mt-3" data-case-state="loaded" data-case-id={caseId}>
        {/* artifactId is deliberately undefined, and SPELLED so askFold's every-element seal can see
            the choice: the ingest panel is not a canvas artifact, so there is no artifact this case
            sits ON, and the one component drawn is a WORKFLOW_CASE, which mounts no ask card. */}
        <SemanticInterpreter
          payload={{ components: [{ archetype: "WORKFLOW_CASE", case: result.payload }] }}
          artifactId={undefined}
        />
      </div>
    );
  }
  if (result.reason === "not_found") {
    return (
      <p className="mt-2 text-[11px] font-mono text-rose-400" data-case-state="not_found">
        Case not found, or not visible to you
      </p>
    );
  }
  if (result.reason === "runner_unavailable") {
    return (
      <p className="mt-2 text-[11px] font-mono text-amber-400" data-case-state="runner_unavailable">
        The case runner is unavailable
      </p>
    );
  }
  return (
    <p className="mt-2 text-[11px] font-mono text-amber-400" data-case-state="invalid">
      The case could not be read ({result.reason}
      {result.reason === "invalid_case_payload" ? `: ${result.detail}` : ""}) — case{" "}
      <span className="font-mono">{caseId}</span>
    </p>
  );
}

/** An event row's own ladder (received, case_opened — `ingestEventLadder`) and, once the case is
 *  opened, the case itself. No review step: an event is never promoted. */
function EventSection({ row }: { row: IngestStatusRow }) {
  const ladder = ingestEventLadder(row.stage);
  return (
    <div className="mt-2" data-ingest-event>
      {ladder && (
        <ul className="flex items-center gap-2" data-ingest-event-ladder>
          {ladder.map((rung) => (
            <li
              key={rung.stage}
              className="flex items-center gap-1 text-[10px] font-mono text-slate-300"
              data-ingest-ladder-stage={rung.stage}
              data-ingest-ladder-state={rung.state}
            >
              <span>{RUNG_GLYPH[rung.state]}</span>
              <span>{rung.stage}</span>
            </li>
          ))}
        </ul>
      )}
      {row.stage === INGEST_CASE_OPENED_STATUS &&
        (row.case_id ? (
          <EventCase caseId={row.case_id} />
        ) : (
          // The producer writes case_id with case_opened (one update_status call); a row at
          // case_opened without one contradicts it. Say so; there is nothing to fetch.
          <p className="mt-2 text-[11px] font-mono text-amber-400" data-case-state="no_case_id">
            This event reports a case was opened but names no case
          </p>
        ))}
    </div>
  );
}

export interface IngestStatusCardProps {
  ingestId: string;
  /** Injectable so tests need not wait on a real 2s cadence. */
  pollIntervalMs?: number;
  /** Seed row — avoids a redundant first fetch right after upload, and lets tests render a
   *  specific status synchronously. */
  initialRow?: IngestStatusRow;
  /**
   * CORTEX-PROPOSED — the dispute route's own `on_behalf_of`: the caller's `authz_id` (see
   * `src/lib/dropIdentity.ts`), threaded down from `IngestEntryBody`'s `useDropIdentity()` rather than this card calling `useAuth()` a second time, so a standalone render of
   * this card — every existing test here — needs no `<AuthProvider>` just to show a status row.
   */
  onBehalfOf?: string | null;
  /** The surrounding turn already drew the duplicate phrase (message or label); the card then draws
   *  only the original's id/stage, so the phrase appears once. */
  duplicatePhraseDrawn?: boolean;
  /** Read the row from `useIngestStatusStore` (the rail's one poller) instead of polling here. */
  fromStore?: boolean;
}

export function IngestStatusCard({
  ingestId,
  pollIntervalMs = 2000,
  initialRow,
  onBehalfOf = null,
  duplicatePhraseDrawn = false,
  fromStore = false,
}: IngestStatusCardProps) {
  const [ownRow, setRow] = useState<IngestStatusRow | null>(initialRow ?? null);
  const [ownNotFound, setNotFound] = useState(false);
  const storeRow = useIngestStatusStore((s) => s.rows[ingestId] ?? null);
  const storeNotFound = useIngestStatusStore((s) => !!s.notFound[ingestId]);
  const row = fromStore ? storeRow : ownRow;
  const notFound = fromStore ? storeNotFound : ownNotFound;
  const setCurrentArtifact = useCanvasStore((s) => s.setCurrentArtifact);
  const [acting, setActing] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionErrorCode, setActionErrorCode] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPollRef = useRef(0);
  const [pollEpoch, setPollEpoch] = useState(0);
  const storeRetry = useIngestStatusStore((s) => s.retry);
  // Store mode uses the store action; self-poll mode calls the transport, then restarts its poll.
  const retry = async (id: string): Promise<{ ok: true } | { ok: false; message: string }> => {
    if (fromStore) return storeRetry(id);
    try {
      await retryIngest(id);
      setRow((cur) => (cur ? { ...cur, stage: "received", failure: null } : cur));
      setPollEpoch((n) => n + 1);
      return { ok: true };
    } catch (err) {
      const refusal = readIngestRetryRefusal(err);
      if (refusal?.status === 409 && refusal.error === "not_failed") {
        // It moved since it was read: re-read now (the stale failed row would stop the interval).
        void fetchIngestStatus(id)
          .then((raw) => {
            const next = readIngestStatusRow(raw);
            if (next) setRow(next);
            setPollEpoch((n) => n + 1);
          })
          .catch(() => undefined);
        return { ok: false, message: "It moved since it was read — refreshed." };
      }
      if (refusal?.status === 403) return { ok: false, message: "This drop can’t be retried from here." };
      return { ok: false, message: readIngestErrorMessage(err) ?? "Retry failed." };
    }
  };

  const tasks = useHumanTaskStore((s) => s.tasks);
  const declarationFor = useTaskKindStore((s) => s.declarationFor);
  // The packet says "<human task id>" without saying which of the task's two ids; accept either.
  const defectTaskId = row?.extraction_defect?.task_id;
  const defectTask = defectTaskId ? tasks.find((t) => t.id === defectTaskId || t.taskId === defectTaskId) ?? null : null;

  // CORTEX-PROPOSED — see `src/lib/ingestOrigin.ts`. `onBehalfOf` arrives as a prop; see its doc
  // comment above.
  const [disputing, setDisputing] = useState(false);
  const [disputeResult, setDisputeResult] = useState<{ stewardTaskId: string | null } | null>(null);
  const [disputeError, setDisputeError] = useState<string | null>(null);
  const [disputeErrorCode, setDisputeErrorCode] = useState<string | null>(null);

  const handleDispute = async (disputeIngestId: string) => {
    if (!onBehalfOf) return;
    setDisputing(true);
    setDisputeError(null);
    setDisputeErrorCode(null);
    try {
      const result = await disputeIngestOrigin(disputeIngestId, onBehalfOf);
      setDisputeResult({ stewardTaskId: result?.steward_task_id ?? null });
    } catch (err) {
      // This route does not exist on the real wire yet (CORTEX-PROPOSED) — a 404/405 there is
      // "not built", not a refusal of THIS dispute, so it gets its own message rather than
      // whatever generic text a bare 404 would otherwise read as.
      const status = (err as { response?: { status?: number } } | null | undefined)?.response?.status;
      if (status === 404 || status === 405) {
        setDisputeError("This server does not accept origin disputes yet.");
        setDisputeErrorCode(null);
      } else {
        const refusal = readActRefusal(err);
        setDisputeError(refusal?.message ?? readIngestErrorMessage(err) ?? "Dispute failed.");
        setDisputeErrorCode(refusal?.error ?? null);
      }
      // Never rendered as disputed on a refusal — the button stays enabled for a deliberate retry.
    } finally {
      setDisputing(false);
    }
  };

  useEffect(() => {
    if (fromStore) return;
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

    if (!initialRow) {
      lastPollRef.current = Date.now();
      void poll();
    }

    timerRef.current = setInterval(() => {
      setRow((current) => {
        if (current && ingestPollingDone(current)) {
          if (timerRef.current) clearInterval(timerRef.current);
          return current;
        }
        // A failed+timeout row is re-read at most every INGEST_FAILED_TIMEOUT_POLL_MS.
        if (
          current?.stage === "failed" &&
          current.failure?.reason_code === INGEST_FAILURE_TIMEOUT &&
          Date.now() - lastPollRef.current < INGEST_FAILED_TIMEOUT_POLL_MS
        ) {
          return current;
        }
        lastPollRef.current = Date.now();
        void poll();
        return current;
      });
    }, pollIntervalMs);

    return () => {
      cancelled = true;
      if (timerRef.current) clearInterval(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingestId, pollIntervalMs, fromStore, pollEpoch]);

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
            role="status"
            data-ingest-status={row.stage}
          >
            {row.stage}
          </span>
        )}
      </div>

      {typeof row.notice_id === "string" && (
        <p className="text-[10px] font-mono text-slate-300" data-ingest-notice-id>
          notice {row.notice_id}
        </p>
      )}

      {/*
       * CORTEX-PROPOSED ORIGIN (`src/lib/ingestOrigin.ts`) — `row.origin === null` is the real,
       * unbuilt producer today: a THIRD state, kept on its OWN attribute name
       * (`data-ingest-origin-unreported`) rather than a value of `data-ingest-origin`, so a
       * selector keyed on the latter can never pick it up as "resolved" or "unresolved" by
       * accident.
       */}
      {row.origin === null ? (
        <p className="mt-2 text-[10px] font-mono text-slate-500" data-ingest-origin-unreported>
          Origin: not reported by this server
        </p>
      ) : row.origin.status === "resolved" ? (
        <div className="mt-2" data-ingest-origin="resolved">
          <p className="text-[10px] font-mono text-slate-300">{originSummary(row.origin)}</p>
          {disputeResult ? (
            <p className="text-[10px] font-mono text-cyan-300" data-ingest-origin-disputed>
              Sent to the steward
              {disputeResult.stewardTaskId ? ` (task ${disputeResult.stewardTaskId})` : ""}
            </p>
          ) : (
            <>
              <button
                type="button"
                data-ingest-origin-dispute
                disabled={disputing || !onBehalfOf}
                title={!onBehalfOf ? "No drop identity (authz_id or verified email) available" : undefined}
                className="mt-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider rounded bg-amber-600/30 text-amber-200 disabled:opacity-40"
                onClick={() => void handleDispute(row.ingest_id)}
              >
                This looks wrong
              </button>
              {disputeError && (
                <p
                  className="mt-1 text-[10px] font-mono text-rose-400"
                  role="alert"
                  data-ingest-origin-dispute-refusal={disputeErrorCode ?? ""}
                >
                  {disputeError}
                </p>
              )}
            </>
          )}
        </div>
      ) : (
        <div className="mt-2" data-ingest-origin="unresolved">
          <p className="text-[10px] font-mono text-slate-300">{originSummary(row.origin)}</p>
          <p className="text-[10px] font-mono text-slate-500" data-ingest-origin-visibility>
            Visible only to you until a steward resolves its origin.
          </p>
        </div>
      )}

      <IngestLeafChip row={row} onRow={setRow} />

      {/* Drawn ONLY for the object. Absent (no claim) and null (no defect on record) draw nothing. */}
      {row.extraction_defect && (
        <p className="mt-2 text-[10px] font-mono text-amber-300" data-ingest-extraction-defect>
          Extraction was corrected by the steward ({row.extraction_defect.edits} rows)
          {defectTask && (
            <>
              {" "}
              <button
                type="button"
                data-ingest-extraction-defect-open
                className="underline text-cyan-300 hover:text-cyan-200"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentArtifact(taskArtifactId(defectTask.id));
                }}
              >
                open the task
              </button>
            </>
          )}
        </p>
      )}

      {isDuplicate ? (
        <p className="mt-2 text-[11px] font-mono text-slate-300" data-ingest-duplicate>
          {!duplicatePhraseDrawn && <span>{duplicatePhrase(row.duplicate!.message)}</span>}
          <span>{duplicatePhraseDrawn ? "" : " "}(duplicate of {row.duplicate!.of_ingest_id})</span>
          {row.stage && <span> — original is at {row.stage}</span>}
        </p>
      ) : row.kind === "event" ? (
        // Document rows (pdf/cad) never reach EventSection and so never fetch a case, even if a
        // case_id is present: Lane 1 says case_id is null on document rows, and a non-null value
        // there is not cortex's to interpret.
        <EventSection row={row} />
      ) : (
        <>
          <ul className="flex items-center gap-2" data-ingest-ladder>
            {ingestStageLadder(row.stage as Parameters<typeof ingestStageLadder>[0]).map((rung) => (
              <li
                key={rung.stage}
                className="flex items-center gap-1 text-[10px] font-mono text-slate-300"
                data-ingest-ladder-stage={rung.stage}
                data-ingest-ladder-state={rung.state}
              >
                <span className={rung.stage === "rejected" || rung.stage === "failed" || rung.stage === INGEST_REVIEW_REJECTED_STATUS ? "text-amber-400" : undefined}>
                  {RUNG_GLYPH[rung.state]}
                </span>
                <span>{rung.stage}</span>
              </li>
            ))}
          </ul>

          {row.stage === INGEST_AWAITING_ORIGIN_STATUS && (
            <p className="mt-2 text-[10px] font-mono text-slate-300" data-ingest-awaiting="awaiting_origin">
              Waiting for a steward to accept where it came from
            </p>
          )}
          {row.stage === INGEST_AWAITING_KIND_STATUS && (
            <p className="mt-2 text-[10px] font-mono text-slate-300" data-ingest-awaiting="awaiting_kind">
              Waiting for its kind — pick PCN or PDN
            </p>
          )}

          {(row.stage === "rejected" || row.stage === "failed" || row.stage === INGEST_REVIEW_REJECTED_STATUS) && (row.stage === "failed" ? (row.failure?.reason ?? row.detail) : row.detail) && (
            <p className="mt-2 text-[11px] font-mono text-amber-400" data-ingest-detail>
              {row.stage === "failed" ? (row.failure?.reason ?? row.detail) : row.detail}
            </p>
          )}
          <IngestFailureExtras
            stage={row.stage ?? ""}
            ingestId={row.ingest_id}
            reasonCode={row.stage === "failed" ? (row.failure?.reason_code ?? null) : null}
            attempt={row.attempt ?? null}
            retry={retry}
          />

          {reviewTask ? (
            <div className="mt-3 flex flex-col gap-2" data-ingest-review>
              {actionError && (
                <p
                  className="text-[10px] font-mono text-rose-400"
                  role="alert"
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
                  aria-label="Reason for decision"
                  data-ingest-reason-input
                  className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
                />
              )}
              <button
                type="button"
                data-ingest-open-review
                className="self-start text-[10px] font-mono underline text-cyan-300 hover:text-cyan-200"
                onClick={(e) => {
                  // The card sits in a canvas card whose own click re-focuses it; this one moves away.
                  e.stopPropagation();
                  setCurrentArtifact(taskArtifactId(reviewTask.id));
                }}
              >
                Open review
              </button>
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
