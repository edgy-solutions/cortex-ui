import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import type { TaskState } from "@/api/types";
import { formatRequestedBy } from "@/lib/requestedBy";
import { verbLabel } from "@/lib/taskDeclaration";
import { promotionReviewIngestId } from "@/lib/promotionReview";
import { useTaskAct } from "./useTaskAct";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "./TaskActParts";
import { PromotionReviewCard } from "./PromotionReviewCard";
import { EmptyConfirmCard } from "./EmptyConfirmCard";
import { readEmptyConfirmTask } from "@/lib/emptyConfirm";

/**
 * APPROVAL_TASK archetype — the canvas card for a HITL task decided by naming a verb. It acts
 * through the SAME sealed `/act` bridge as the old inbox card; nothing about the decision path
 * changes — it just lives on the canvas now, not in a modal.
 *
 * ── AN UNDECLARED KIND GETS NO VERBS ──────────────────────────────────────────────────────
 *
 * This card offered Approve and Reject to EVERY kind that reached it, and an unregistered kind
 * reaches it by default: `taskKindRegistry`'s fallback archetype is APPROVAL_TASK, so any task
 * species nobody had declared landed here and was handed two buttons.
 *
 * That is not a labelling problem. Pressing one posts a decision through `/act`, and ADR-0034
 * archives decision records immutably as promotion evidence — so the cost of guessing is a
 * permanent record of a judgement the data may not represent. "Approve" on *this notice could
 * not be prepared for review* is the case that produced the TRIAGE_TASK species, and it shipped
 * exactly this way.
 *
 * DEFAULT-DENY. An affordance is a CLAIM that the system knows what this decision means, and
 * that claim needs a declaration behind it. A label that says nothing is harmless; an
 * affordance that says nothing still acts.
 *
 * ── THE VERBS ARE THE DECLARATION'S NOW, NOT THIS FILE'S ──────────────────────────────────
 *
 * The deny was right and it was also the ONLY behaviour available, because a hardcoded table of
 * five kinds was the only thing being asked. The deployment declares eight, six of them
 * APPROVAL_TASK, and cortex had never heard of the six `risk_acceptance_*` species — so every
 * one of them drew "unknown species here" with no buttons at all.
 *
 * Extending the table would not have fixed it either. A High acceptance takes `accepted` and
 * the gate REFUSES `approved`: an approval says the artifact is in order, an acceptance says a
 * named authority is taking the residual risk onto themselves. Two different acts, and a card
 * offering the generic verb offers one nobody can submit.
 *
 * So the served declaration decides, in ITS order, and `taskDeclaration.ts` carries why the two
 * orders in that payload differ and why a MISSING declaration is not `declared: false`.
 *
 * ── THE TABLE REMAINS AS A FALLBACK, AND ONLY UNTIL THE READ PATH ROLLS ───────────────────
 *
 * The endpoint is built and not yet merged, so no row carries a declaration today. Dropping
 * `isRegisteredKind` now would take the buttons off `pcn_disposition` — a species that works —
 * for the length of a deploy window, which is a regression bought with no benefit. It goes when
 * a declaration is actually reaching this card.
 */
export interface ApprovalTaskPayload {
  task_id: string;
  kind: string;
  /**
   * THE SHARED UNION, not a second narrower copy. This field used to redeclare four of the
   * fifteen states, so a task arriving `acknowledged` type-errored here and was fine in
   * `TaskRef` — one fact, two declarations, and the narrow one governing this surface.
   */
  task_state?: TaskState;
  title: string;
  summary: string;
  audience: string;
  requested_by: string;
  subject_ref: string | null;
  /**
   * The served task-kind declaration, when the row carries one.
   *
   * ABSENT IS NOT EMPTY — see the component and `readTaskDeclaration`. Reading its absence as
   * "declares nothing" would strip the buttons off every task that works today, during a deploy
   * window, for no reason a reader could see.
   */
  declaration?: unknown;
  /**
   * The row's own served payload, passed through untouched (`taskArtifact.ts`'s single mapping
   * point). This card stays KIND-AGNOSTIC — it draws only two FIXED, generic shapes off it
   * (`suggestion`: a flat key/value object; `evidence`: a `{source, excerpt?}` array) and names
   * no species-specific field by spelling. Absent, or not an object, draws neither section.
   */
  payload?: unknown;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

type Scalar = string | number | boolean | null;

function isScalar(v: unknown): v is Scalar {
  return v === null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

/**
 * The generic suggestion read — null unless `payload.suggestion` is itself a non-null,
 * non-array object. A value under a key that is NOT a scalar is dropped from `entries` but still
 * counted in `skipped`, so a reader can see that something was withheld without this card having
 * to know what that something was.
 */
function readSuggestionEntries(
  payload: unknown,
): { entries: Array<{ key: string; value: Scalar }>; skipped: number } | null {
  if (!isPlainObject(payload) || !isPlainObject(payload.suggestion)) return null;
  const suggestion = payload.suggestion;
  const entries: Array<{ key: string; value: Scalar }> = [];
  let skipped = 0;
  for (const key of Object.keys(suggestion)) {
    const value = suggestion[key];
    if (isScalar(value)) entries.push({ key, value });
    else skipped += 1;
  }
  return { entries, skipped };
}

/**
 * The generic evidence read — null unless `payload.evidence` is a non-empty array with at least
 * one well-shaped `{source: string, excerpt?: string}` entry. A malformed entry (no string
 * `source`) is dropped rather than rendered half-filled; it is never counted, unlike a skipped
 * suggestion value, because the spec names only the latter.
 */
function readEvidenceItems(payload: unknown): Array<{ source: string; excerpt: string | null }> | null {
  if (!isPlainObject(payload) || !Array.isArray(payload.evidence) || payload.evidence.length === 0) {
    return null;
  }
  const items: Array<{ source: string; excerpt: string | null }> = [];
  for (const raw of payload.evidence) {
    if (!isPlainObject(raw) || typeof raw.source !== "string") continue;
    items.push({ source: raw.source, excerpt: typeof raw.excerpt === "string" ? raw.excerpt : null });
  }
  return items.length > 0 ? items : null;
}

/**
 * Which verbs read as AFFIRMING, for COLOUR ONLY.
 *
 * The label is the claim; this only makes a three-verb card scannable. Deliberately a small
 * closed list rather than a guess: a verb nobody has classified gets the cautious styling, which
 * is the honest default for a decision this client does not understand. Nothing is hidden,
 * reordered or renamed by it.
 */
export const AFFIRMING = new Set(["approved", "accepted", "acknowledged", "concurred", "linked"]);

export function ApprovalTaskCard({ task }: { task: ApprovalTaskPayload }) {
  // A `document_promotion` task naming an `ingest_id` draws the review card; anything else draws
  // the generic card below, unchanged. Decided here, on the card every APPROVAL_TASK site already
  // mounts, so no call site can be the one that forgot (see `promotionReviewIngestId`).
  // A `document_empty_confirm` task whose payload claims the empty shape draws its own card (spec 208);
  // the two kinds are disjoint, so the order of the two checks does not matter.
  const empty = readEmptyConfirmTask(task.kind, task.payload);
  if (empty) return <EmptyConfirmCard task={task} empty={empty} />;
  const ingestId = promotionReviewIngestId(task.kind, task.payload);
  return ingestId ? <PromotionReviewCard task={task} ingestId={ingestId} /> : <GenericApprovalTaskCard task={task} />;
}

function GenericApprovalTaskCard({ task }: { task: ApprovalTaskPayload }) {
  const a = useTaskAct(task);
  const { acting, done, reason, setReason, verbs, needsReason, act } = a;

  // THE TWO GENERIC, KIND-AGNOSTIC SECTIONS — see the readers' doc comments above. Computed
  // unconditionally, independent of `contradiction`/`declared`/`done`, so a reader sees them for
  // any task carrying them regardless of what decision state the rest of the card is in.
  const suggestion = readSuggestionEntries(task.payload);
  const evidenceItems = readEvidenceItems(task.payload);

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          <ClipboardCheck className="w-4 h-4 text-neon-pink" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1">
            {task.title}
          </h3>
          <span
            className={`px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${
              done || task.task_state !== "pending"
                ? "text-slate-400 border-white/10 bg-white/5"
                : "text-pink-300 border-pink-500/40 bg-pink-500/10"
            }`}
          >
            {/* NOT THE BARE VERB when the workflow did not resume — see `act()`. */}
            {done ? (done.resumed ? verbLabel(done.decision) : "Recorded") : (task.task_state ?? "pending")}
          </span>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {task.kind} · {task.audience}
        </p>
      </div>

      {task.summary && (
        <p className="text-sm text-slate-300 mb-4 leading-relaxed">{task.summary}</p>
      )}

      <div className="space-y-0.5 text-[10px] font-mono text-slate-500 uppercase tracking-wider mb-5">
        {task.requested_by && <p>requested by · {formatRequestedBy(task.requested_by)}</p>}
        {task.subject_ref && <p className="break-all">subject · {task.subject_ref}</p>}
      </div>

      {suggestion && (
        <div
          className="rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 mb-4"
          data-task-suggestion
          {...(suggestion.skipped > 0 ? { "data-task-suggestion-skipped": suggestion.skipped } : {})}
        >
          {suggestion.entries.map(({ key, value }) => (
            <p key={key} className="text-[11px] font-mono text-slate-300">
              <span className="text-slate-500">{key}:</span> {String(value)}
            </p>
          ))}
        </div>
      )}

      {evidenceItems && (
        <div className="rounded border border-cyan-500/20 bg-cyan-500/5 px-3 py-2.5 mb-4" data-task-evidence>
          {evidenceItems.map((item, i) => (
            <p key={i} className="text-[11px] font-mono text-slate-300" data-task-evidence-item>
              <span className="text-slate-500">{item.source}</span>
              {item.excerpt ? `: ${item.excerpt}` : ""}
            </p>
          ))}
        </div>
      )}

      {isActBlocked(a) ? (
        <TaskActBlocked task={task} a={a} />
      ) : (
        <div className="flex flex-col gap-2">
          <TaskActNotices a={a} />
          {/*
            THE REASON FIELD APPEARS FOR THE VERBS THAT DECLARE IT, and BEFORE the press rather
            than after a refusal. A field that materialised only once a decision was rejected
            would make the requirement discoverable by failing — which on a surface that archives
            decisions is exactly the wrong way round.
          */}
          {verbs.some(needsReason) && (
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="reason — required for some decisions below"
              aria-label="Reason for decision"
              data-reason-input
              className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
            />
          )}
          <div className="flex flex-wrap gap-2">
            {verbs.map((v) => {
              const blocked = needsReason(v) && !reason.trim();
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => act(v)}
                  disabled={acting || blocked}
                  data-verb={v}
                  title={blocked ? `${verbLabel(v)} requires a reason` : undefined}
                  className={`flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 transition-colors cursor-pointer ${
                    AFFIRMING.has(v)
                      ? "bg-neon-green/10 border-neon-green/50 text-neon-green hover:bg-neon-green/20"
                      : "bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                  }`}
                >
                  {AFFIRMING.has(v) ? (
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5" />
                  )}{" "}
                  {verbLabel(v)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
