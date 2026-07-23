/**
 * "Watch my workflow" — the read-only, gated domain view of a running workflow instance.
 *
 * The UI face of the backend Slice-3 observation core. Renders ONLY the observer-facing projection
 * (steps/stages/participants the observer may see); it receives no `redactions` (audit-only) and so
 * cannot leak what was hidden. A deny renders an honest "not cleared" card and nothing else
 * (existence-oracle: the deny reveals only the deny). An other-party step that was redacted simply
 * isn't present — the view shows the workflow as the observer is entitled to see it, no more.
 *
 * Presentation mirrors the live-stage capsule + step list aesthetic; the Restate UI stays the
 * operator view, this is the domain view.
 */
import { motion } from "framer-motion";
import { EyeOff, Bot, User, Lock } from "lucide-react";
import {
  presentStepStatus,
  asStepStatus,
  isAgentKind,
} from "@/lib/workflowVocab";
import type { ObservationProjection, ObservedStep } from "./types";

function StepRow({ step }: { step: ObservedStep }) {
  const st = presentStepStatus(asStepStatus(step.status));
  const agent = isAgentKind(step.kind);
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5 last:border-b-0">
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${st.dotClass} ${st.pulse ? "animate-pulse" : ""}`}
        title={st.label}
      />
      {agent ? (
        <Bot className="w-3.5 h-3.5 text-neon-cyan shrink-0" />
      ) : (
        <User className="w-3.5 h-3.5 text-neon-pink shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-xs font-mono text-white truncate">{step.id}</p>
        <p className="text-[9px] font-mono text-slate-500 uppercase tracking-tighter truncate">
          {agent
            ? step.subject
              ? `over ${step.subject}`
              : "agent action"
            : step.actor
              ? `by ${step.actor}`
              : "human action"}
        </p>
      </div>
      <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter shrink-0">
        {st.label}
      </span>
    </div>
  );
}

export function WorkflowObservationView({ projection }: { projection: ObservationProjection }) {
  if (!projection.visible) {
    return (
      <div className="p-4 glass-panel border-white/10 flex items-center gap-3 text-slate-400">
        <EyeOff className="w-4 h-4 shrink-0" />
        <div>
          <p className="font-mono text-xs text-slate-300">Not cleared to observe this workflow</p>
          <p className="font-mono text-[10px] text-slate-500 mt-0.5">
            You are not a participant and lack the classification clearance to view it.
          </p>
        </div>
      </div>
    );
  }

  const stages = projection.domain_stages ?? [];
  const currentIdx = projection.current_stage ? stages.indexOf(projection.current_stage) : -1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-full glass-panel border-neon-blue/30 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-white/5">
        <span className="font-mono text-[10px] font-bold text-slate-300 tracking-widest uppercase truncate">
          {projection.workflow_id}
        </span>
        {projection.classification && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400 text-[8px] font-bold uppercase tracking-tighter shrink-0">
            <Lock className="w-2.5 h-2.5" /> {projection.classification}
          </span>
        )}
      </div>

      {/* Domain-stage progression */}
      {stages.length > 0 && (
        <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/5 overflow-x-auto">
          {stages.map((stage, i) => {
            const done = currentIdx >= 0 && i < currentIdx;
            const active = i === currentIdx;
            return (
              <div key={stage} className="flex items-center gap-1.5 shrink-0">
                {i > 0 && <span className="w-4 h-px bg-white/10" />}
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-tighter border ${
                    active
                      ? "border-neon-blue/60 bg-neon-blue/10 text-neon-blue"
                      : done
                        ? "border-neon-green/30 bg-neon-green/5 text-neon-green/80"
                        : "border-white/10 text-slate-500"
                  }`}
                >
                  {stage.replace(/_/g, " ")}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Steps */}
      {projection.steps.length > 0 ? (
        <div className="font-mono">
          {projection.steps.map((s) => (
            <StepRow key={s.id} step={s} />
          ))}
        </div>
      ) : (
        <div className="px-4 py-3 text-[10px] font-mono text-slate-500 italic">
          No steps visible to you at this stage.
        </div>
      )}

      {/* Participants */}
      {projection.participants.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 px-4 py-3 border-t border-white/10 bg-white/5">
          <span className="text-[9px] font-mono text-slate-500 uppercase tracking-widest mr-1">
            participants
          </span>
          {projection.participants.map((p) => (
            <span
              key={p.role}
              className="px-2 py-0.5 rounded-full border border-white/10 text-[9px] font-mono text-slate-300"
            >
              {p.role} · {p.identity}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
