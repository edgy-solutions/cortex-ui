import { motion } from "framer-motion";
import { User, Bot } from "lucide-react";
import type { Message } from "@/store/useInterviewStore";
import { ThinkingCard } from "./ThinkingCard";
import { WarningCard } from "./WarningCard";
import { SemanticInterpreter } from "../registry/SemanticInterpreter";

interface MessageBubbleProps {
  message: Message;
}

export function MessageBubble({ message }: MessageBubbleProps) {
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
          {/* Thinking steps (agent only) */}
          {!isUser && message.thinkingSteps && message.thinkingSteps.length > 0 && (
            <ThinkingCard steps={message.thinkingSteps} />
          )}

          {/* Message content */}
          {(message.content || isUser) && !message.error && (
            <div
              className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                isUser
                  ? "bg-neon-purple/15 border border-neon-purple/30 text-slate-200"
                  : "glass-panel-sm text-slate-300"
              }`}
            >
              <span className={!isUser ? "font-mono text-[13px]" : ""}>
                {message.content}
              </span>

              {/* Streaming cursor */}
              {message.isStreaming && message.content && (
                <span className="inline-block w-2 h-4 ml-0.5 bg-neon-blue animate-pulse-neon align-middle" />
              )}
            </div>
          )}

          {/* Error state (Legacy API Error) */}
          {!isUser && message.error && !message.payload && (
            <WarningCard 
              error={message.error} 
              onRetry={() => {
                // Extract the last user message to retry
              }} 
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

      {/* Composite Dashboard — rendered full-width OUTSIDE the 75% bubble constraint */}
      {!isUser && message.payload && (
        <div className="w-full mt-3 pl-11">
          <SemanticInterpreter payload={message.payload} />
        </div>
      )}
    </motion.div>
  );
}
