import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";
import type { Message } from "@/store/useInterviewStore";
import { ThinkingCard } from "./ThinkingCard";
import { WarningCard } from "./WarningCard";

interface MessageBubbleProps {
  message: Message;
  /**
   * True only for the LATEST agent message in the transcript. Used to
   * decide whether to render the pipeline (`ThinkingCard`): only the
   * current turn shows the full stage list; prior turns collapse to
   * just the receipt line. Reasoning: the pipeline is live-telemetry
   * for the active turn — once a new question is asked, the prior
   * turn's stages are noise. The artifact + its receipt are the
   * durable record. Computed by NeuralStream from the messages array.
   */
  isLatestAgent?: boolean;
}

export function MessageBubble({ message, isLatestAgent }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="w-full"
    >
      <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
        {/* Agent avatar */}
        {!isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neon-blue/10 border border-neon-blue/30 flex items-center justify-center mt-1">
            <Bot className="w-4 h-4 text-neon-blue" />
          </div>
        )}

        <div
          className={`max-w-[75%] flex flex-col gap-2 ${isUser ? "items-end" : "items-start"}`}
        >
          {/* Thinking steps — only on the LATEST agent message.
              Prior turns collapse to just their receipt line (the
              durable record). See `isLatestAgent` JSDoc on
              MessageBubbleProps for the why. */}
          {!isUser &&
            isLatestAgent &&
            message.thinkingSteps &&
            message.thinkingSteps.length > 0 && (
              <ThinkingCard steps={message.thinkingSteps} />
            )}

          {/* Message content */}
          {(message.content || isUser) && !message.error && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                isUser
                  ? "bg-neon-purple/15 border border-neon-purple/30 text-slate-200"
                  : message.isReceipt
                  ? "glass-panel border-neon-green/30 text-neon-green font-mono text-[10px] tracking-wider uppercase"
                  : "glass-panel-sm text-slate-300"
              }`}
            >
              <span className={!isUser && !message.isReceipt ? "font-mono text-[13px]" : ""}>
                {message.content}
              </span>

              {/* Streaming cursor */}
              {message.isStreaming && message.content && !message.isReceipt && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-neon-blue animate-pulse-neon align-middle" />
              )}
            </div>
          )}

          {/* Error state (Legacy API Error) */}
          {!isUser && message.error && (
            <WarningCard
              error={message.error}
            />
          )}
        </div>

        {/* User avatar */}
        {isUser && (
          <div className="flex-shrink-0 w-8 h-8 rounded-full bg-neon-purple/10 border border-neon-purple/30 flex items-center justify-center mt-1">
            <User className="w-4 h-4 text-neon-purple" />
          </div>
        )}
      </div>

      {/* The composite-dashboard inline-render path is GONE per ADR-0023
          Phase 1 acceptance #3: the rendered output lives on the Artifact
          in useCanvasStore, NOT on the Message. The canvas (CanvasPane)
          renders it; this transcript bubble only shows the chat-side
          content + the artifact-generated receipt line. Keeping a
          duplicate inline render here would re-collapse Message and
          Artifact into one concept, the trap this acceptance prevents. */}
    </motion.div>
  );
}
