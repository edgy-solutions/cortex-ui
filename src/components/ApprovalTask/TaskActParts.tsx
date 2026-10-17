import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import type { TaskAct } from "./useTaskAct";
import { verbLabel } from "@/lib/taskDeclaration";

/**
 * The parts of an APPROVAL_TASK card that say what the decision path did or will not do, shared by
 * the generic card and the promotion review card so both say it the same way. Moved here from
 * `ApprovalTaskCard` unchanged; the comments explain each state's precedence and honesty rule.
 */

/** True when the card must draw `TaskActBlocked` instead of its verbs. */
export function isActBlocked(a: TaskAct): boolean {
  return Boolean(a.contradiction) || (a.declared && Boolean(a.decl) && a.decl!.accepts.length === 0) || !a.declared || Boolean(a.done);
}

/** The four states in which no verb is offered: contradiction, declared-no-verbs, undeclared, done. */
export function TaskActBlocked({ task, a }: { task: ApprovalTaskPayload; a: TaskAct }) {
  const { contradiction, declared, decl, done } = a;
  return (
    <>
      {contradiction ? (
        /*
         * THE AUDIENCE AND THE KIND DISAGREE, AND THE MENU CONFIRMS THE AUDIENCE SIDE IS A REAL
         * SPECIES. Takes precedence over every other state below — the declared-no-verbs block,
         * the undeclared-kind block, a corrected menu, even a completed `done` — because none of
         * those render once this one is showing: no button here ever reaches `act()`, so `done`
         * cannot become true for this contradiction in the first place.
         */
        <div
          className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2.5"
          role="alert"
          data-kind-contradiction
        >
          <p className="text-[11px] font-mono uppercase tracking-widest text-red-400/90">
            audience and kind disagree
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            This task's audience is for{" "}
            <span className="font-mono text-slate-300">{contradiction.audienceKind}</span> but the
            task says it is <span className="font-mono text-slate-300">{contradiction.taskKind}</span>.
            No decision is offered: deciding would record a{" "}
            <span className="font-mono text-slate-300">{contradiction.taskKind}</span> decision on
            a <span className="font-mono text-slate-300">{contradiction.audienceKind}</span>{" "}
            question.
          </p>
        </div>
      ) : declared && decl && decl.accepts.length === 0 ? (
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
          role="alert"
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
        /**
         * HONEST ON SUCCESS. The verb reads as itself ONLY when the workflow actually resumed —
         * otherwise this says so, with `data-act-outcome` carrying which: a record that landed
         * but did not move the workflow on is a different fact from one that did, and the bare
         * verb would claim the resume regardless.
         */
        <div
          className="text-[11px] font-mono uppercase tracking-widest text-neon-green"
          role="status"
          data-act-outcome={done.resumed ? "resumed" : "recorded"}
        >
          {done.resumed ? verbLabel(done.decision) : `Recorded: ${verbLabel(done.decision)} — workflow not resumed`}
        </div>
      ) : null}
    </>
  );
}

/** A corrected menu and an inline refusal, drawn above the verbs. */
export function TaskActNotices({ a }: { a: TaskAct }) {
  const { corrected, refusal } = a;
  return (
    <>
      {/*
        THE BUTTONS CHANGED UNDER THE READER'S HAND, so the card says why. A menu that
        silently rearranged itself after a press is worse than the refusal it is reporting:
        the reader would not know whether their decision landed, and the second press would
        be made blind.
      */}
      {corrected && (
        <div
          className="rounded border border-amber-500/30 bg-amber-500/5 px-3 py-2"
          role="alert"
          data-decision-corrected
        >
          <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400/90">
            that decision was refused — nothing was recorded
          </p>
          <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">
            {corrected.message} These are the decisions this task accepts.
          </p>
        </div>
      )}
      {/*
        A 422 NAMING NO MENU — see `act()`. Inline, not a toast, and the buttons and the
        typed reason below are untouched: the person corrects and retries deliberately, and
        nothing here retries on their behalf.
      */}
      {refusal && (
        <div
          className="rounded border border-red-500/30 bg-red-500/5 px-3 py-2"
          role="alert"
          data-act-refusal
        >
          <p className="text-[11px] text-slate-300 leading-relaxed">{refusal.message}</p>
          {refusal.code && (
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-red-400/70">
              {refusal.code}
            </p>
          )}
        </div>
      )}
    </>
  );
}
