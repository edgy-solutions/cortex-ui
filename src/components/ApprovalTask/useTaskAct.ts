import { useState } from "react";
import { toast } from "sonner";
import { actOnHumanTask, type HeaderEdit, type RowEdits } from "@/api/client";
import { actRefusal } from "@/lib/reviewRowEdits";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";
import { readPolicyRefusal, type PolicyRefusal } from "@/lib/policyRefusal";
import { PROPOSED_MOVED_ERROR } from "@/lib/accessProposal";
import { isRegisteredKind } from "@/lib/taskKindRegistry";
import { readTaskDeclaration, verbLabel, audienceKindContradiction, offeredVerbs } from "@/lib/taskDeclaration";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import type { ReviewCoverageWire } from "@/lib/reviewCoverage";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";

/**
 * THE DECISION PATH of an APPROVAL_TASK card, shared by every card that draws one: the generic
 * `ApprovalTaskCard` and the promotion review card (`PromotionReviewCard`). Lifted out of the
 * generic card WHOLE, comments and all, so a second card acting on the same task cannot drift from
 * the first on what it offers, what it refuses to send, or how it reads a refusal. Nothing here
 * draws; it only says which verbs, whether each needs a reason, and what the last press did.
 */
export type TaskAct = ReturnType<typeof useTaskAct>;

/**
 * THE SUCCESS CLAIM OF A ROUTE THAT NAMES A STAGE (`document_empty_confirm`, spec 208), or null.
 * That route never resumes a workflow, so the generic "Recorded — workflow not resumed" would be
 * false of it; what it DID is move the ingest to `stage`. Null (the generic wording) unless the
 * result carries a non-blank string `stage`.
 */
export function stageOutcomeSentence(
  decision: string,
  res: { stage?: unknown; attempt?: unknown; extraction_defect?: unknown },
): string | null {
  if (typeof res.stage !== "string" || res.stage.trim() === "") return null;
  if (res.stage === "no_parts") return "Confirmed: no parts in this document";
  if (res.stage === "received") {
    const filed =
      typeof res.extraction_defect === "string" && res.extraction_defect.trim() !== ""
        ? ` — filed as ${res.extraction_defect}`
        : "";
    return `Sent back for re-extraction with the text fallback (attempt ${String(res.attempt)})${filed}`;
  }
  return `${verbLabel(decision)} — now ${res.stage}`;
}

export function useTaskAct(task: ApprovalTaskPayload) {
  const [acting, setActing] = useState(false);
  /** The decision that landed, and whether the workflow actually resumed — see `act()` below for
   *  why the verb alone is not an honest thing to show. */
  const [done, setDone] = useState<{
    decision: string;
    resumed: boolean;
    /** Set only by a route that names the ingest's new stage (see `stageOutcomeSentence`). */
    stage?: string;
    attempt?: number;
    sentence?: string;
  } | null>(null);
  const [reason, setReason] = useState("");
  /**
   * A 422 that is NOT `invalid_decision_for_kind` — a refusal with no menu to adopt, drawn
   * inline rather than as a toast so the person can read it, correct the reason, and retry
   * deliberately. See `act()` for the three-field precedence (`message`, `error`, the bare
   * string) and why this never auto-retries.
   */
  const [refusal, setRefusal] = useState<{ message: string; code?: string; newTaskId?: string | null; policy?: PolicyRefusal } | null>(null);

  /**
   * WHAT THE SERVER SAID IT ACTUALLY ACCEPTS, after refusing what we offered.
   *
   * `/act` answers a wrong verb with 422 and a body carrying `allowed` — the declaration's own
   * order, `list(...)` and never `sorted(...)` on that side too. That list is authoritative in
   * a way the card's copy is not: it is read at decision time, from the species the task really
   * has.
   *
   * THIS IS A CORRECTION PATH, NOT A DISCOVERY PATH. The declaration is how the card learns its
   * verbs; probing to find them would mean posting decisions nobody made, on a surface that
   * archives them. This only fires when the two disagree — a stale bundle, a declaration that
   * moved under a long-lived tab — and the disagreement is itself the fact worth rendering.
   */
  const [corrected, setCorrected] = useState<{ allowed: string[]; message: string } | null>(null);

  // THE SERVED DECLARATION IS THE AUTHORITY WHERE THERE IS ONE; the interim table where there
  // is not. See the header for why both, and for how long.
  // THE SERVED MENU, then the row, then the interim table. The row field is kept because the
  // task listing also carries a declaration and a row-level one is the more specific claim; the
  // store is what makes the path reachable at all, since nothing populates that field today.
  const fromKinds = useTaskKindStore((s) => s.declarationFor(task.kind));
  const decl = readTaskDeclaration(task.declaration) ?? fromKinds;
  const declared = decl ? decl.declared : isRegisteredKind(task.kind);

  // THE SERVED MENU, keyed, for `audienceKindContradiction` below — it needs to ask about an
  // arbitrary PREFIX (e.g. `risk_acceptance_medium` out of `risk_acceptance_medium:SUSTAINMENT`),
  // not just this row's own kind, so `declarationFor` alone will not do.
  const byKind = useTaskKindStore((s) => s.byKind);
  const isDeclaredKind = (k: string): boolean =>
    Object.hasOwn(byKind, k) && byKind[k].declared === true;
  /**
   * THE AUDIENCE SAYS ONE SPECIES, THE TASK SAYS ANOTHER.
   *
   * `risk_acceptance_medium:SUSTAINMENT` on a row whose `kind` is `workflow_ack` is not a
   * labelling quirk: deciding it would record a `workflow_ack` decision on what the audience
   * says is a risk-acceptance question. This is only a claim while the served menu confirms the
   * prefix IS a declared kind — `access_grant:finance` and `promotion:X` use the same `prefix:`
   * shape with a prefix that is not a kind at all, and an unloaded menu makes `isDeclaredKind`
   * false for everything, so neither makes a claim. See `audienceKindContradiction`.
   */
  const contradiction = audienceKindContradiction(task.audience, task.kind, isDeclaredKind);


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
  const verbs = corrected ? corrected.allowed : offeredVerbs(decl);
  const needsReason = (v: string) => (decl ? decl.reasonRequired.has(v) : false);

  // `reasonOverride`: a card that composes its reason at the press (the review card's reject code plus
  // note) passes it here, so it is not left waiting a render for `setReason` to land.
  const act = async (decision: string, reasonOverride?: string, rowEdits?: RowEdits, headerEdits?: HeaderEdit[], sectionVerdicts?: unknown[], page?: number, reviewCoverage?: ReviewCoverageWire) => {
    const said = (reasonOverride ?? reason).trim();
    // A REASON-REQUIRED VERB IS NOT SUBMITTED WITHOUT ONE. Dismissing a reported hazard with no
    // stated rationale is the erasure this domain cares about most; the gate refuses it, and a
    // card that posted anyway would turn a declared requirement into a server error the reader
    // cannot act on.
    if (needsReason(decision) && !said) return;
    setActing(true);
    // A FRESH ATTEMPT CLEARS THE LAST REFUSAL. Left stale, an old inline refusal would sit next
    // to a decision that has not been retried yet and could be misread as describing this press.
    setRefusal(null);
    try {
      // No edits: the call is the three-argument one it always was.
      const res =
        reviewCoverage
          ? await actOnHumanTask(task.task_id, decision, said, undefined, rowEdits, undefined, headerEdits, undefined, undefined, reviewCoverage)
          : sectionVerdicts
          ? await actOnHumanTask(task.task_id, decision, said, undefined, undefined, undefined, undefined, sectionVerdicts)
          : page !== undefined
          ? await actOnHumanTask(task.task_id, decision, said, undefined, undefined, undefined, undefined, undefined, page)
          : headerEdits
          ? await actOnHumanTask(task.task_id, decision, said, undefined, rowEdits, undefined, headerEdits)
          : rowEdits
            ? await actOnHumanTask(task.task_id, decision, said, undefined, rowEdits)
            : await actOnHumanTask(task.task_id, decision, said);
      /**
       * HONEST ON SUCCESS: the verb is shown ONLY when `workflow_resumed === true`.
       *
       * A 200 from `/act` is not the same claim as "the workflow moved on" — `rows_resolved`,
       * `accepted`, `status` can all come back without a resume, and a card that printed
       * "Approved" regardless would archive-adjacent text the gateway itself did not assert.
       * `=== true` rather than truthy: `undefined` is not a resume either.
       */
      const resumed = res.workflow_resumed === true;
      const sentence = stageOutcomeSentence(decision, res);
      setDone({
        decision,
        resumed,
        ...(sentence !== null
          ? { stage: res.stage as string, sentence, ...(typeof res.attempt === "number" ? { attempt: res.attempt } : {}) }
          : {}),
      });
      markTaskResolvedByTaskId(task.task_id);
      // A promote with row edits files them as an extraction_defect; the toast names it.
      const filed =
        typeof res.extraction_defect === "string" && res.extraction_defect.trim() !== ""
          ? ` — ${(res.row_edits?.corrected ?? 0) + (res.row_edits?.added ?? 0) + (res.row_edits?.deleted ?? 0) + (res.row_edits?.header ?? 0)} correction(s) filed as ${res.extraction_defect}`
          : "";
      if (sentence !== null) {
        toast.success(sentence);
        return;
      }
      toast.success(
        (resumed ? verbLabel(decision) : `Recorded: ${verbLabel(decision)} — workflow not resumed`) + filed,
      );
    } catch (err) {
      const res = (err as { response?: { status?: number; data?: unknown } })?.response;
      const status = res?.status;
      // THE REFUSAL CARRIES THE MENU. 422 `invalid_decision_for_kind` names the verbs this
      // species really takes, in the declaration's order. Adopting them turns a dead end into
      // the next action, and a toast saying "Action failed" would have thrown that list away —
      // leaving the reader to guess at exactly the thing the server just told them.
      const detail = (res?.data as { detail?: unknown } | undefined)?.detail;
      const d = typeof detail === "object" && detail !== null ? (detail as Record<string, unknown>) : null;
      const errorCode = typeof d?.error === "string" ? d.error : undefined;
      const allowed =
        d && errorCode === "invalid_decision_for_kind" && Array.isArray(d.allowed)
          ? d.allowed.filter((v): v is string => typeof v === "string" && v.trim().length > 0)
          : null;
      if (allowed && allowed.length > 0) {
        setCorrected({
          allowed,
          message: typeof d?.message === "string" ? d.message : "That decision was refused.",
        });
        return;
      }
      // A 422 whose error code IS `invalid_decision_for_kind` but whose `allowed` list came back
      // empty or junk falls through to the toast below, same as before this change — an empty
      // correction would blank the buttons with no way to act at all, strictly worse than the
      // toast it replaces, and it is a DIFFERENT case from the one below: the server named the
      // right kind of problem, it just sent nothing usable to adopt.
      //
      // THE ROW STAYS PENDING: roll #12's gateway (`/human_tasks/{id}/act`) answers a failed
      // resume with an error rather than a 200 carrying `workflow_resumed:false` — the task is
      // NOT resolved, so the person can read why and retry.
      // A POLICY REFUSAL (the declared envelope) on 401/403/409 is drawn inline with who can grant, not
      // toasted away. Only an envelope that reads whole; any other 401/403/409 keeps its old arm below.
      if (status === 401 || status === 403 || status === 409) {
        const policy = readPolicyRefusal(err);
        if (policy) {
          setRefusal({ message: policy.message ?? policy.error, code: policy.error, policy });
          return;
        }
      }
      // PROPOSED (ADR-0062 section 7): the grant card approved a head sha that moved after review.
      if (status === 409 && errorCode === PROPOSED_MOVED_ERROR) {
        setRefusal({ message: "The proposal changed after review.", code: errorCode });
        return;
      }
      if (status === 409 && errorCode === "task_already_resolved") {
        /**
         * NOT ACTIONABLE ANY MORE — a member of the same audience resolved it first. Mark it
         * resolved here too, same side effect as the success path below, so this card (and
         * anything reading the store) stops treating it as pending.
         *
         * THE OUTCOME SHOWN IS THE SERVER'S, NOT THE PERSON'S OWN VERB: this press never landed,
         * so `decision` (the verb the person just tried) is not what happened — `d.decision` and
         * `d.acted_by`, the settled row's own fields, are.
         */
        markTaskResolvedByTaskId(task.task_id);
        const settledDecision = typeof d?.decision === "string" ? d.decision : undefined;
        const settledBy = typeof d?.acted_by === "string" ? d.acted_by : undefined;
        const base =
          typeof d?.message === "string" ? d.message : "This task was already resolved.";
        toast.error(settledDecision && settledBy ? `${base} (${settledDecision} by ${settledBy})` : base);
        return;
      }
      /**
       * A 422 NAMING NO MENU — i.e. not `invalid_decision_for_kind` — drawn INLINE
       * (`data-act-refusal`), not a toast: the buttons and the typed reason stay exactly as the
       * person left them, so they correct and retry deliberately. No automatic retry — this card
       * never re-sends on their behalf.
       *
       * THE BLANK-REASON REFUSAL IS NOT A SEPARATE CODE: a reason-required verb submitted empty
       * comes back as `422 {detail:{error:"invalid_decision_for_kind", kind, allowed, message}}`
       * — the same shape as a wrong verb — so the corrected-menu arm above is what draws it, by
       * adopting the (unchanged) `allowed` list and showing the server's `message`.
       *
       * THIS ARM NOW ALSO COVERS ROLL #12's RESUME REFUSALS — `task_unresumable` (409) and
       * `workflow_resume_failed` (502) — and, generally, any 409/502/503 whose `detail` is an
       * object carrying a string `message`: the row stays pending either way, so the honest
       * thing is to let the person read why and retry, not to toast "Action failed" and drop the
       * reason the gateway gave.
       */
      if (
        (status === 422 && errorCode !== "invalid_decision_for_kind") ||
        ((status === 409 || status === 502 || status === 503) &&
          d !== null &&
          typeof d.message === "string")
      ) {
        const message =
          typeof d?.message === "string"
            ? d.message
            : errorCode !== undefined
              ? errorCode
              : typeof detail === "string"
                ? detail
                : Array.isArray(detail)
                  ? (actRefusal(err)?.title ?? `Refused (${status})`)
                  : `Refused (${status})`;
        // 204 `stale_extraction`: new_task_id is the open replacement, or null (the row is re-extracting).
        // Never the task acted on.
        if (errorCode === "stale_extraction") {
          const nt = d !== null && typeof d.new_task_id === "string" && d.new_task_id.trim() !== "" ? d.new_task_id : null;
          setRefusal({ message, code: errorCode, newTaskId: nt !== null && nt !== task.task_id ? nt : null });
          return;
        }
        setRefusal({ message, code: errorCode });
        return;
      }
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


  return { acting, done, reason, setReason, refusal, corrected, decl, declared, contradiction, verbs, needsReason, act };
}
