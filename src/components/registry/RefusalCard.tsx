import React from "react";
import type { RefusalEnvelope } from "@/lib/refusalEnvelope";

const HEADLINE: Record<string, string> = {
  source_unavailable: "The source could not be read",
  engine_fault: "The engine failed to answer",
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
      <p className="font-mono text-xs text-amber-300/90">
        {HEADLINE[envelope.outcome] ?? "Refused"}
      </p>
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
