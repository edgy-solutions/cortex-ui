import React from "react";
import type { RefusalEnvelope } from "@/lib/refusalEnvelope";
import { AskCardConnected } from "../elicitation/AskCardConnected";
import { RefusalCard } from "./RefusalCard";

/**
 * The one mount for a refusal envelope.
 *
 * With an `ask` it is a CHOICE: the ask is drawn on `AskCardConnected`, because on the chat path
 * the pick IS a chat turn, plus one slate line with the outcome token. Without one it is
 * `RefusalCard` exactly as before. Every `<RefusalCard` mount goes through here, so a refusal
 * that carries an ask cannot be drawn as red text by whichever mount happened to be forgotten.
 */
export const RefusalOrChoice: React.FC<{
  envelope: RefusalEnvelope;
  archetype?: string;
  scopeLabel?: string;
  answeringArtifactId?: string;
}> = ({ envelope, archetype, scopeLabel, answeringArtifactId }) => {
  if (!envelope.ask) {
    return <RefusalCard envelope={envelope} archetype={archetype} scopeLabel={scopeLabel} />;
  }
  return (
    <div data-refusal-choice>
      <AskCardConnected component={envelope.ask} answeringArtifactId={answeringArtifactId} />
      <p className="px-1 pl-3 font-mono text-[10px] text-slate-500" data-refusal-outcome={envelope.outcome}>
        {envelope.outcome}
      </p>
    </div>
  );
};
