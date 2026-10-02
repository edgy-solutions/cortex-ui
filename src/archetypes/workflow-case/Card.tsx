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

  return (
    <section className="flex flex-col gap-3" data-archetype="WORKFLOW_CASE">
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

      {/* HISTORY — entries in the order given, never resorted. */}
      <div className="flex flex-col gap-1" data-history>
        {history.length > 0 ? (
          <ol className="flex flex-col gap-0.5">
            {history.map((entry: CaseHistoryEntry, i) => (
              <li key={i} className="font-mono text-[10px] text-slate-500">
                <span className="text-slate-400">{entry.at}</span> {entry.event}
                {entry.stage ? ` · ${entry.stage}` : ""}
                {entry.actor ? ` · ${entry.actor}` : ""}
              </li>
            ))}
          </ol>
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

      {/* ARTIFACT — shown only when the producer released one (both `uri` and `released_at`
          present). Otherwise the absence is on the card, not a blank slot. */}
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
            data-artifact-unreleased
          >
            not yet released
          </p>
        )}
      </div>
    </section>
  );
}
