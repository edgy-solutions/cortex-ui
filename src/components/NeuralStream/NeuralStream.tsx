import { InputBar } from "./InputBar";
import { AnswersPanel } from "./AnswersPanel";
import { LiveStageCapsule } from "./LiveStageCapsule";

/**
 * NeuralStream — the left-side surface, answer-first (ADR-0028 v1).
 *
 * Following the Answers Panel mock, the left column is purely
 * answer-centric: the durable answer list (with a live strip at the top
 * where the in-flight answer will land), a COMPACT live stage capsule
 * pinned above the prompt, and the input bar. The verbose per-message
 * conversation thread (bubbles + the 5-row ThinkingCard) was REMOVED —
 * live feedback is now the top strip + the bottom capsule, and the
 * durable answer lives in the list + canvas. (MessageBubble/ThinkingCard/
 * QuestionNavigator remain in the tree as dead code, removable.)
 */
export function NeuralStream() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden relative">
      {/* Answer-first list — full height. */}
      <div className="flex-1 min-h-0 flex flex-col">
        <AnswersPanel />
      </div>

      {/* Compact live stage indicator — only while a turn is in flight,
          pinned directly above the prompt. */}
      <LiveStageCapsule />

      {/* Input bar — always pinned. */}
      <InputBar />
    </div>
  );
}
