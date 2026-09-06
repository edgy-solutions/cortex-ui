import type { Artifact } from "@/api/types";
import { slotWord } from "@/lib/slotWord";

/**
 * WHAT WAS ANSWERED, on a card whose answer has not arrived yet.
 *
 * The ruling is "slot in the strip, not in the question", and the phrase now goes byte-equal
 * because of it. But the strip renders from `resolved_intent`, which does not exist until the
 * answer lands — so between the click and the answer the card showed a bare question with no
 * trace of the pick, and a person who had just chosen something saw no evidence that they had.
 * This is that trace, and it is deliberately temporary: once the artifact carries the server's
 * own account, the strip says it and says it better.
 *
 * THE ARROW IS ONLY DRAWN FOR A PICK. A pick carries the id the verb takes, so
 * `Inventory Visibility -> C4` is two true things and their relation. Typed words have no
 * right-hand side yet — the resolver has not run — and drawing one would assert a narrowing
 * that has not happened. Same rule the interpretation strip follows for a refused slot.
 */
export function AnsweredChip({ artifact }: { artifact: Artifact }) {
  const a = artifact.answered_with;
  if (!a || !a.slot || !a.label) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded border border-neon-cyan/25 bg-neon-cyan/[.06] px-1.5 py-0.5 font-mono text-[10px] text-slate-300"
      data-answered-chip
      data-answered-slot={a.slot}
    >
      <span className="text-slate-500">{slotWord(a.slot)}:</span>
      <span className="text-slate-200">{a.label}</span>
      {a.value && a.value !== a.label && (
        <span className="text-neon-cyan">&rarr; {a.value}</span>
      )}
    </span>
  );
}
