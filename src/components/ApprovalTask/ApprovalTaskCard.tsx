import { useState } from "react";
import { CheckCircle2, XCircle, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { actOnHumanTask } from "@/api/client";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { formatRequestedBy } from "@/lib/requestedBy";
import { isRegisteredKind } from "@/lib/taskKindRegistry";
import { readTaskDeclaration, verbLabel } from "@/lib/taskDeclaration";

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
  task_state?: "pending" | "approved" | "rejected" | "expired";
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
}

/**
 * Which verbs read as AFFIRMING, for COLOUR ONLY.
 *
 * The label is the claim; this only makes a three-verb card scannable. Deliberately a small
 * closed list rather than a guess: a verb nobody has classified gets the cautious styling, which
 * is the honest default for a decision this client does not understand. Nothing is hidden,
 * reordered or renamed by it.
 */
const AFFIRMING = new Set(["approved", "accepted", "acknowledged", "concurred", "linked"]);

export function ApprovalTaskCard({ task }: { task: ApprovalTaskPayload }) {
  const [acting, setActing] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // THE SERVED DECLARATION IS THE AUTHORITY WHERE THERE IS ONE; the interim table where there
  // is not. See the header for why both, and for how long.
  const decl = readTaskDeclaration(task.declaration);
  const declared = decl ? decl.declared : isRegisteredKind(task.kind);

  /**
   * The verbs to offer, IN THE DECLARATION'S ORDER.
   *
   * NEVER SORTED. The producer emits `list(...)` rather than `sorted(...)` and seals it, because
   * re-sorting reproduces the defect the SDK's ordering fix was cut to close and it arrives
   * looking like tidiness. A sort here would undo that one surface further out.
   *
   * With no declaration, the two seed verbs this card has always offered — correct for
   * `pcn_disposition`, which is the one declared species the interim table knows.
   */
  const verbs = decl ? decl.accepts : ["approved", "rejected"];
  const needsReason = (v: string) => (decl ? decl.reasonRequired.has(v) : false);

  const act = async (decision: string) => {
    // A REASON-REQUIRED VERB IS NOT SUBMITTED WITHOUT ONE. Dismissing a reported hazard with no
    // stated rationale is the erasure this domain cares about most; the gate refuses it, and a
    // card that posted anyway would turn a declared requirement into a server error the reader
    // cannot act on.
    if (needsReason(decision) && !reason.trim()) return;
    setActing(true);
    try {
      const res = await actOnHumanTask(task.task_id, decision, reason.trim());
      setDone(decision);
      markTaskResolvedByTaskId(task.task_id);
      toast.success(
        res.workflow_resumed ? `${verbLabel(decision)} — workflow resumed` : verbLabel(decision),
      );
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      toast.error(
        status === 403
          ? "Not authorized to act on this task"
          : status === 404
            ? "Task no longer available"
            : "Action failed",
      );
    } finally {
      setActing(false);
    }
  };

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
            {done ?? task.task_state ?? "pending"}
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

      {declared && decl && decl.accepts.length === 0 ? (
        /*
         * DECLARED, AND TAKES NOTHING. A different fact from an undeclared species, and the
         * reason `declared` is read rather than inferred from an empty list: one says the mesh
         * has no such species, the other says this species is not decided on this surface. Same
         * distinction as absent-versus-refused, and the same justification — different repairs.
         */
        <div
          className="rounded border border-slate-600/40 bg-slate-500/5 px-3 py-2.5"
          data-declared-no-verbs
        >
          <p className="text-[11px] font-mono uppercase tracking-widest text-slate-400">
            no decision here
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            <span className="font-mono text-slate-300">{task.kind}</span> is declared and accepts
            no decisions on this surface.
          </p>
        </div>
      ) : !declared ? (
        /*
         * NO VERBS, AND THE REASON NAMED. Not a disabled button: a greyed Approve still says
         * "this is an approval, you merely cannot do it right now", which is a claim about the
         * species. Nothing here knows what decisions this kind accepts, so it offers none and
         * says which kind it could not place.
         *
         * The task is still READ in full above — title, summary, who asked. Reading is safe;
         * only deciding needs a declaration.
         */
        <div
          className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2.5"
          data-undeclared-kind={task.kind}
        >
          <p className="text-[11px] font-mono uppercase tracking-widest text-amber-400/90">
            unknown species here
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            Nothing has declared what <span className="font-mono text-slate-300">{task.kind}</span>{" "}
            tasks accept, so no decision is offered. Acting on a guess would archive a record of
            a judgement this card cannot justify.
          </p>
        </div>
      ) : done ? (
        <div className="text-[11px] font-mono uppercase tracking-widest text-neon-green">
          {verbLabel(done)}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
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
