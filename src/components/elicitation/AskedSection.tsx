import { useState } from "react";
import { ChevronRight } from "lucide-react";
import type { Artifact } from "@/api/types";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useAgent } from "@/hooks/useAgent";
import { slotWord } from "@/lib/slotWord";
import { readAskOf, readPick } from "@/lib/askedPick";
import { resolveAsk } from "./Elicitation.contract";
import { dispatchReroute } from "./rerouteDispatch";

/**
 * "YOU WERE ASKED" — one line on the answer card, and the menu behind it.
 *
 * ── THE PROBLEM WITH KEEPING THE MENU ─────────────────────────────────────────────────────
 *
 * The fold replaces the ask card with its answer, and that is the ruling: a menu you can no
 * longer use, sitting above its own answer, is chrome that outlived its purpose. But it throws
 * something away — a reader who wants to know WHAT THEY WERE OFFERED has nowhere to look, and
 * a ten-option list is exactly the case where that matters.
 *
 * So the offer is not deleted, it is COLLAPSED. One line says what was chosen; the answer owns
 * the screen. Tap it and the original menu unfolds, at the size it always was. A ten-option
 * list only costs a card's worth of room when someone asks for it.
 *
 * ── PICKING AGAIN IS A REAL ACTION, NOT A CORRECTION ──────────────────────────────────────
 *
 * A different option produces a SECOND ANSWER derived from the same ask — which is what
 * multi-valued `derived_from` is for. Nothing is undone and nothing is replaced: the first
 * answer stays, and the reader ends up with both, having asked one question. That is why this
 * re-sends the ask's own id rather than this artifact's.
 *
 * ── IT READS THE ASK FROM THE FOLDED PARENT ───────────────────────────────────────────────
 *
 * Not from state a card kept alive across the swap — that is the thing the replace ruling
 * exists to avoid. The parent is reachable because the server said so, so this renders only
 * where the lineage is real.
 */
export function AskedSection({ artifact }: { artifact: Artifact }) {
  const parentId = artifact.derived_from_artifact_id ?? null;
  const parent = useCanvasStore((s) =>
    parentId ? (s.artifacts.find((a) => a.id === parentId) ?? null) : null,
  );
  const { sendMessage } = useAgent();
  const [open, setOpen] = useState(false);
  const [blocked, setBlocked] = useState<string | null>(null);

  if (!parent) return null;

  /**
   * THE ELICITATION COMPONENT IS THE GATE, and an `isAsk()` call beside it was DEAD WEIGHT.
   *
   * It read well — "only render for an ask" — and a mutation deleting it changed nothing
   * observable, because `isAsk` is `some(ELICITATION)` and this is `find(ELICITATION)`. They
   * are the same predicate, so no input can separate them. An equivalent mutant on a GUARD
   * means the guard is unreachable, and the honest response is to delete it rather than to
   * invent a case that makes it look alive.
   */
  const ask = readAskOf(parent);
  if (!ask) return null;
  // NOTHING TO REOPEN WITHOUT A MENU. A no-menu ask was answered in words; there is no set to
  // show, and a section promising one would open on nothing.
  if (ask.options.length === 0) return null;

  /**
   * What was chosen, preferring the SERVER's account over this client's.
   *
   * `answered_with` is what this browser sent and does not survive a reload; `accepted_slots`
   * is what the producer says reached the verb. Reading the client's first is only a nicety
   * for the label — the id comes from whichever is present, and after a reload only one is.
   */
  const pick = readPick(artifact, ask);
  const chosenValue = pick?.value ?? "";
  const chosenLabel = pick?.label ?? "";

  const repick = (value: string) => {
    try {
      setBlocked(null);
      const reroute = resolveAsk(ask, value);
      const res = dispatchReroute(reroute, ask, (query, boundSlots, spoken, answeredWith) =>
        // THE ASK'S ID, not this artifact's. The new answer is a sibling of this one under the
        // same question, which is what makes it a second answer rather than a replacement.
        sendMessage(query, boundSlots, spoken, answeredWith, parent.id),
      );
      setBlocked(res.blocked ?? null);
      if (!res.blocked) setOpen(false);
    } catch (e) {
      setBlocked(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mb-3" data-asked-section>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded px-1 py-1 text-left font-mono text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/[.03]"
        data-asked-toggle
      >
        <ChevronRight
          className={`w-3 h-3 flex-shrink-0 text-slate-600 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-slate-500">{slotWord(ask.slot)}:</span>
        <span className="text-slate-200">{chosenLabel || "answered"}</span>
        {chosenValue && chosenValue !== chosenLabel && (
          <span className="text-neon-cyan">&rarr; {chosenValue}</span>
        )}
        {/* THE OFFER IS NEVER LOST, and the count says so without spending a row on it. */}
        <span className="ml-auto text-slate-600">
          {open ? "hide" : `${ask.options.length} offered`}
        </span>
      </button>

      {open && (
        <div className="mt-1.5 border-l-2 border-neon-cyan/25 pl-3" data-asked-options>
          <p className="font-mono text-[11px] text-slate-400">
            Which <span className="text-neon-cyan">{slotWord(ask.slot)}</span>?
          </p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {ask.options.map((o) => {
              const isChosen = o.value === chosenValue;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => repick(o.value)}
                  data-asked-option={o.value}
                  data-asked-chosen={isChosen ? "" : undefined}
                  /* THE CHOSEN ONE IS MARKED AND STILL LIVE. Re-picking it would ask the same
                     question again, which is a legitimate thing to want and not an error. */
                  className={
                    "px-2 py-1 rounded border font-mono text-[11px] transition-colors " +
                    (isChosen
                      ? "border-neon-cyan bg-neon-cyan/15 text-neon-cyan"
                      : "border-neon-cyan/30 text-slate-200 hover:border-neon-cyan/70 hover:bg-neon-cyan/10")
                  }
                >
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1.5 font-mono text-[9px] uppercase tracking-widest text-slate-600">
            {/* SAID PLAINLY, because the alternative reading is that this undoes the answer
                below it. Nothing is replaced; the reader ends up with both. */}
            picking another adds a second answer — this one stays
          </p>
          {blocked && (
            <p className="mt-1.5 font-mono text-[10px] text-amber-400/80" data-asked-blocked>
              {blocked}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
