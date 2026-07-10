import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useInterviewStore } from "@/store/useInterviewStore";
import { MessageBubble } from "./MessageBubble";
import { InputBar } from "./InputBar";
import { AnswersPanel } from "./AnswersPanel";
import { LiveStageCapsule } from "./LiveStageCapsule";

/**
 * NeuralStream — the left-side surface.
 *
 * 2026-06-29 restructure: the left margin is now durable-first.
 *
 *   - TOP: `QuestionNavigator` — the durable index of past questions,
 *     sourced from `useCanvasStore.artifacts` (Electric-synced,
 *     hydrates on refresh per Hop 3). Survives reload; click-to-
 *     foreground via `setCurrentArtifact`.
 *   - BOTTOM (collapsible / minor): the in-session conversation thread
 *     (user/agent bubbles + ThinkingCard pipeline for the active turn),
 *     sourced from `useInterviewStore` (ephemeral / browser-memory).
 *     Surfaces live pipeline telemetry for the current turn — dies on
 *     refresh, by design ([[coupled-interim-mechanisms-retire-together]]
 *     fenced as its own message-substrate arc).
 *   - INPUT: `InputBar` always pinned to the bottom.
 *
 * The transient conversation thread only shows during an active turn
 * (messages exist for this session) — on refresh it collapses to the
 * navigator + input.
 *
 * Option A clean cut (2026-06-22): the `AgentTeamLoader` component
 * (the "summoning specialized graph agents" badges) was REMOVED. It
 * surfaced the supervisor's active persona roster, which was
 * decorative — the substrate already routes by predicate-graph
 * walk, not by persona team-up. Per the architect's principle
 * "surface what the pipeline did, never synthesize" — badges that
 * imply collaboration that isn't really there in the routing
 * semantics are exactly the kind of theater we cut.
 */
export function NeuralStream() {
  const messages = useInterviewStore((s) => s.messages);
  const isProcessing = useInterviewStore((s) => s.isProcessing);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Find the LATEST agent message id. Only that message's
  // ThinkingCard (pipeline list) is rendered in MessageBubble —
  // prior agent turns collapse to just their receipt line. Reasoning:
  // the pipeline is "what's happening right now" telemetry; once a
  // new question is asked, the prior turn's stages are noise. The
  // artifact + its question_text are the durable record (surfaced
  // by `QuestionNavigator` from useCanvasStore.artifacts).
  const latestAgentMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "agent") return messages[i].id;
    }
    return null;
  }, [messages]);

  // Auto-scroll on new messages or content updates.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isProcessing]);

  const hasLiveConversation = messages.length > 0;

  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* TOP — durable question navigator. ~60% of left pane when no
          live conversation; ~40% when a live turn is in flight (the
          conversation thread takes more space then).

          `min-h-0` is REQUIRED on every flex child that contains
          scrolling content. Without it, `flex-1` grows to fit the
          CHILD CONTENT instead of the parent's available space —
          which pushes the InputBar off-screen AND breaks the inner
          `overflow-y-auto` (no constrained height = no overflow).
          2026-06-30: first cut omitted min-h-0 → architect reported
          "no input bar visible, list not scrollable." */}
      <div
        className={
          hasLiveConversation
            ? "h-2/5 min-h-0 flex flex-col border-b border-glass-border"
            : "flex-1 min-h-0 flex flex-col"
        }
      >
        <AnswersPanel />
      </div>

      {/* BOTTOM — ephemeral live conversation thread. Only present
          while messages exist this session; renders nothing on
          fresh reload (durable nav above is the persistent surface).
          Same `min-h-0` reasoning as the navigator wrapper above. */}
      {hasLiveConversation && (
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-4"
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <MessageBubble
                key={msg.id}
                message={msg}
                isLatestAgent={
                  msg.role === "agent" && msg.id === latestAgentMsgId
                }
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Compact live stage indicator — only while a turn is in flight,
          pinned directly above the prompt (the verbose per-message
          ThinkingCard remains in the thread; this is the at-a-glance
          "current state above the prompt"). */}
      <LiveStageCapsule />

      {/* Input bar — always pinned. */}
      <InputBar />
    </div>
  );
}
