import { useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useInterviewStore } from "@/store/useInterviewStore";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";

/**
 * NeuralStream — the left-side chat / pipeline-progress surface.
 *
 * Option A clean cut (2026-06-22): the `AgentTeamLoader` component
 * (the "summoning specialized graph agents" badges) was REMOVED. It
 * surfaced the supervisor's active persona roster, which was
 * decorative — the substrate already routes by predicate-graph
 * walk, not by persona team-up. Per the architect's principle
 * "surface what the pipeline did, never synthesize" — badges that
 * imply collaboration that isn't really there in the routing
 * semantics are exactly the kind of theater we cut.
 *
 * What this surface still does:
 *   - Renders user/agent chat bubbles
 *   - Renders the per-message ThinkingCard with the 5 pipeline stages
 *     (driven by typed `pipeline_stage` events from the gateway)
 *   - Surfaces typed errors via ThinkingCard rows in `error` state
 *     (driven by typed `pipeline_error` events)
 */
export function NeuralStream() {
  const messages = useInterviewStore((s) => s.messages);
  const isProcessing = useInterviewStore((s) => s.isProcessing);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages or content updates
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isProcessing]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Message area */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-4 space-y-4"
      >
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-16 h-16 rounded-full border border-neon-blue/30 flex items-center justify-center mb-4 animate-breathe">
              <div className="w-8 h-8 rounded-full bg-neon-blue/10 animate-pulse-neon" />
            </div>
            <p className="text-slate-500 font-mono text-sm mb-1">
              NEURAL STREAM ACTIVE
            </p>
            <p className="text-slate-600 text-xs max-w-md">
              Begin the interrogation. Mention assets, failure modes, or
              maintenance schedules to activate ontology binding.
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
        </AnimatePresence>
      </div>

      {/* Input bar */}
      <InputBar />
    </div>
  );
}
