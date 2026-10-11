import React from "react";
import type { RefusalEnvelope } from "@/lib/refusalEnvelope";

const HEADLINE: Record<string, string> = {
  source_unavailable: "The source could not be read",
  engine_fault: "The engine failed to answer",
  hazard_closed: "Hazard closed \u2014 no open risk to accept",
  not_assessed: "Hazard not assessed \u2014 no risk level, no authority",
  unknown_hazard: "Hazard not held \u2014 nothing to assess",
};

/** Draws a refusal envelope (PR #13) as a refusal -- never as an empty card. */
export const RefusalCard: React.FC<{
  envelope: RefusalEnvelope;
  archetype?: string;
  scopeLabel?: string;
}> = ({ envelope, archetype, scopeLabel }) => {
  const source = [envelope.connector, envelope.fn].filter(Boolean).join(" · ");
  return (
    <div
      role="status"
      data-refusal
      data-refusal-outcome={envelope.outcome}
      className="rounded-md border border-amber-500/30 bg-slate-800/30 p-4 space-y-1"
    >
      <div className="flex items-center gap-2">
        <p className="font-mono text-xs text-amber-300/90">{HEADLINE[envelope.outcome] ?? "Refused"}</p>
        {envelope.hazard_id && (
          <span
            data-refusal-hazard={envelope.hazard_id}
            className="rounded border border-amber-500/30 px-1.5 font-mono text-[10px] text-amber-300/90"
          >
            {envelope.hazard_id}
          </span>
        )}
      </div>
      {envelope.gap && (
        <p data-refusal-gap className="font-mono text-[11px] text-amber-200/80">
          {envelope.gap}
        </p>
      )}
      <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
        {envelope.outcome}
        {archetype ? ` · ${archetype}` : ""}
        {scopeLabel ? ` · ${scopeLabel}` : ""}
      </p>
      <p className="font-mono text-[11px] text-slate-400">{envelope.reason ?? "No reason given"}</p>
      {source && <p className="font-mono text-[10px] text-slate-500">{source}</p>}
    </div>
  );
};
