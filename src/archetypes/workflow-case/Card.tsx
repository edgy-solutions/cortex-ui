import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ApprovalTaskCard } from "@/components/ApprovalTask/ApprovalTaskCard";
import type {
  CaseApproval,
  CaseDefinition,
  CaseHistoryEntry,
  CaseInstance,
  CaseOption,
  WorkflowCasePayload,
} from "./contract";

/**
 * WORKFLOW_CASE — a subject's chain of workflow instances, drawn generic over whatever the
 * payload carries. See `contract.ts`'s header for why `instances` is a list and why this whole
 * shape is cortex-proposed rather than a mirror of a served wire.
 *
 * This card hard-codes no verb, stage, step, role, domain, or kind name — every label on
 * screen is read off the payload's own `definition`/`instance`/`approval` objects. A source
 * guard (`fixtures.test.tsx`) keeps it that way; fixtures are free to carry domain words, this
 * file and its siblings are not.
 */
export interface WorkflowCaseProps {
  case: WorkflowCasePayload;
}

function findStep(definition: CaseDefinition, stepId: string) {
  return definition.steps.find((s) => s.id === stepId);
}

export function WorkflowCase({ case: payload }: WorkflowCaseProps) {
  const instances = payload.instances ?? [];
  const history = payload.history ?? [];
  const options = payload.options ?? [];
  const approvals = payload.approvals ?? [];
  const artifact = payload.output_artifact;
  const released = !!artifact && !!artifact.uri && !!artifact.released_at;

  // Selection: row 0 on mount (the card standard: the first row).
  const [sel, setSel] = useState(0);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);
  useEffect(() => {
    rowRefs.current[sel]?.scrollIntoView?.({ block: "nearest" });
  }, [sel]);
  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSel(Math.min(sel + 1, history.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSel(Math.max(sel - 1, 0));
    }
  };

  // TOP LINE — the LAST instance is the latest act (chain order).
  const last = instances.length > 0 ? instances[instances.length - 1] : undefined;
  const lastStage = last?.current_stage ?? null;
  const lastStageKnown =
    !!last && lastStage !== null && last.definition.domain_stages.includes(lastStage);

  const selEntry: CaseHistoryEntry | undefined = history[sel];
  const selInstance = selEntry
    ? instances.find((inst) => inst.workflow_id === selEntry.workflow_id)
    : undefined;
  const selStep =
    selEntry && selEntry.step_id && selInstance
      ? findStep(selInstance.definition, selEntry.step_id)
      : undefined;
  const selApproval =
    selEntry && selEntry.step_id
      ? approvals.find(
          (a) => a.workflow_id === selEntry.workflow_id && a.step_id === selEntry.step_id,
        )
      : undefined;

  return (
    <section className="flex flex-col gap-3" data-archetype="WORKFLOW_CASE">
      {/* TOP LINE — names the subject and the stage of the latest instance. */}
      <p className="font-mono text-[11px] text-slate-300" data-case-topline>
        <span data-topline="subject">{payload.subject_ref}</span>
        {last && (
          <>
            <span className="text-slate-600"> · </span>
            <span data-topline="workflow">{last.definition.name}</span>
            <span className="text-slate-600"> · </span>
            {lastStageKnown ? (
              <span data-topline="stage">{lastStage}</span>
            ) : (
              <span data-topline="stage" data-case-topline-stage-absent>
                stage not stated
              </span>
            )}
            <span className="text-slate-600"> · </span>
            <span data-topline="status">{last.status}</span>
          </>
        )}
      </p>

      {/* HEADER — the subject, and each instance by its definition's own name. Nothing here
          is a domain label; `definition.name` is the producer's own string. */}
      <div className="flex flex-col gap-1">
        <h3 className="font-mono text-sm text-slate-200">{payload.subject_ref}</h3>
        <ul className="flex flex-col gap-0.5">
          {instances.map((instance) => (
            <li
              key={instance.workflow_id}
              className="font-mono text-[11px] text-slate-400"
              data-instance
              data-workflow-id={instance.workflow_id}
            >
              {instance.definition.name}
            </li>
          ))}
        </ul>
      </div>

      {/* STAGES — every instance's own domain_stages, in order. The current stage is marked
          only when the producer named one that the definition actually has; an unrecognised or
          absent current_stage is an absence on the card, never a guessed first stage. */}
      <div className="flex flex-col gap-2" data-stages>
        {instances.map((instance) => {
          const current = instance.current_stage ?? null;
          const isKnown = current !== null && instance.definition.domain_stages.includes(current);
          return (
            <ol
              key={instance.workflow_id}
              className="flex flex-wrap gap-2"
              data-workflow-id={instance.workflow_id}
            >
              {instance.definition.domain_stages.map((stage) => (
                <li
                  key={stage}
                  className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
                  data-stage={stage}
                  {...(isKnown && stage === current ? { "data-stage-current": "" } : {})}
                >
                  {stage}
                </li>
              ))}
              {!isKnown && (
                <li
                  className="font-mono text-[10px] uppercase tracking-widest text-amber-400/80"
                  data-stage-unknown
                >
                  current stage not stated
                </li>
              )}
            </ol>
          );
        })}
      </div>

      {/* HISTORY — entries in the order given, never resorted. Rows left, the selected entry's
          detail right. The pane shows the step and the approval; it NEVER draws ApprovalTaskCard,
          so a pending task's verbs are drawn once, in the approvals section. */}
      <div className="flex flex-col gap-1" data-history>
        {history.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <ol
              role="listbox"
              aria-label="case history"
              tabIndex={0}
              onKeyDown={onKeyDown}
              className="flex max-h-[50vh] min-w-0 flex-col gap-0.5 overflow-auto"
            >
              {history.map((entry: CaseHistoryEntry, i) => (
                <li
                  key={i}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  role="option"
                  aria-selected={i === sel}
                  data-case-row={i}
                  {...(i === sel ? { "data-selected": "" } : {})}
                  onClick={() => setSel(i)}
                  className={`cursor-pointer rounded px-1 font-mono text-[10px] ${
                    i === sel ? "bg-cyan-500/10 text-slate-200" : "text-slate-500"
                  }`}
                >
                  <span className="text-slate-400">{entry.at}</span> {entry.event}
                  {entry.stage ? ` · ${entry.stage}` : ""}
                  {entry.actor ? ` · ${entry.actor}` : ""}
                </li>
              ))}
            </ol>
            {selEntry && (
              <div
                className="min-w-0 rounded border border-white/5 p-2 font-mono text-[10px] text-slate-400"
                data-case-pane
                data-case-pane-row={sel}
              >
                <p className="text-slate-200">{selEntry.event}</p>
                <p>{selEntry.at}</p>
                {selEntry.stage && <p>{selEntry.stage}</p>}
                {selEntry.actor && <p>{selEntry.actor}</p>}
                {selStep ? (
                  <p data-case-pane-step={selStep.id}>
                    {selStep.title ?? selStep.id} · {selStep.kind}
                    {selStep.audience ? ` · ${selStep.audience}` : ""}
                  </p>
                ) : (
                  <p
                    className="uppercase tracking-widest text-amber-400/80"
                    data-case-pane-step-absent
                  >
                    no step recorded
                  </p>
                )}
                {selApproval && (
                  <div data-case-pane-approval>
                    <p>{selApproval.status}</p>
                    {selApproval.status === "decided" ? (
                      <>
                        <p>{selApproval.decided_by}</p>
                        <p>{selApproval.decision}</p>
                        <p>
                          {!selApproval.reason || selApproval.reason.trim() === ""
                            ? "no reason given"
                            : selApproval.reason}
                        </p>
                      </>
                    ) : (
                      <p>awaiting a decision; act on it below</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <p
            className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
            data-history-absent
          >
            no history
          </p>
        )}
      </div>

      {/* OPTIONS — each with its label and its data in key order, and the artifact link if
          the option carries one. */}
      <div className="flex flex-col gap-2" data-options>
        {options.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {options.map((option: CaseOption) => (
              <li
                key={option.id}
                className="rounded-md border border-slate-700/50 bg-slate-800/30 p-3"
                data-option
              >
                <p className="font-mono text-[11px] text-slate-200">{option.label}</p>
                <dl className="flex flex-col gap-0.5">
                  {Object.keys(option.data).map((key) => (
                    <div key={key} className="flex gap-2 font-mono text-[10px] text-slate-500">
                      <dt>{key}</dt>
                      <dd className="text-slate-300">{String(option.data[key])}</dd>
                    </div>
                  ))}
                </dl>
                {option.artifact_uri && (
                  <a
                    className="font-mono text-[10px] text-cyan-400/80 underline"
                    href={option.artifact_uri}
                  >
                    {option.artifact_uri}
                  </a>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p
            className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
            data-options-absent
          >
            no options
          </p>
        )}
      </div>

      {/* APPROVAL CHAIN — labelled by the owning instance's own step title, falling back to the
          step id when the definition names none. A pending approval with a task hands that task
          to ApprovalTaskCard UNCHANGED — this card never draws a verb itself. */}
      <div className="flex flex-col gap-2" data-approvals>
        {approvals.length > 0 ? (
          <ol className="flex flex-col gap-2">
            {approvals.map((approval: CaseApproval, i) => {
              const instance = instances.find(
                (inst: CaseInstance) => inst.workflow_id === approval.workflow_id,
              );
              const step = instance ? findStep(instance.definition, approval.step_id) : undefined;
              const label = step?.title ?? approval.step_id;
              const reasonAbsent = !approval.reason || approval.reason.trim() === "";
              return (
                <li key={i} className="flex flex-col gap-1" data-approval>
                  <p className="font-mono text-[11px] text-slate-200">{label}</p>
                  {approval.status === "decided" ? (
                    <div className="font-mono text-[10px] text-slate-400">
                      <p>{approval.decided_by}</p>
                      <p>{approval.decision}</p>
                      {reasonAbsent ? (
                        <p
                          className="uppercase tracking-widest text-amber-400/80"
                          data-reason-absent
                        >
                          no reason given
                        </p>
                      ) : (
                        <p>{approval.reason}</p>
                      )}
                    </div>
                  ) : approval.task ? (
                    <ApprovalTaskCard task={approval.task} />
                  ) : (
                    <p
                      className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
                      data-approval-awaiting
                    >
                      awaiting a decision
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p
            className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
            data-approvals-absent
          >
            no approvals
          </p>
        )}
      </div>

      {/* ARTIFACT — shown only when the producer attached one (both `uri` and `released_at`
          present). A released case may carry no artifact (a release that emits an
          ActionRecord carries none), so the card states the ABSENCE of an artifact, not the case's state. */}
      <div data-artifact-section>
        {released && artifact ? (
          <a
            className="font-mono text-[10px] text-cyan-400/80 underline"
            href={artifact.uri}
            data-artifact
          >
            {artifact.label ?? artifact.uri}
          </a>
        ) : (
          <p
            className="font-mono text-[10px] uppercase tracking-widest text-slate-500"
            data-artifact-absent
          >
            no artifact
          </p>
        )}
      </div>
    </section>
  );
}
