import { useEffect, useRef } from "react";
import { create } from "zustand";

/**
 * PRESENTATION MODE — the rails collapse so the board gets the room.
 *
 * ── IT IS A VIEW STATE, NOT A LAYOUT CHANGE ──────────────────────────────────────────────
 *
 * Nothing here touches a card. Positions, sizes and the arrangement are identical entering and
 * leaving, so presenting a board never reflows it — the same invariant that makes a seeded card
 * byte-identical to a dragged one, applied to the viewport. What changes is how much pane the
 * camera has to fit the SAME world into.
 *
 * That is why this is its own store and not a flag on `useStageStore`: everything in the stage
 * store describes the board, and a mode that must provably not alter the board should not live
 * among the fields that do. `fullPane` there is a different concept entirely — one CARD filling
 * the pane — and overloading it would have made "does presenting change the layout" a question
 * about a shared boolean.
 *
 * ── NOTHING IS ONLY REACHABLE BY HOVER ───────────────────────────────────────────────────
 *
 * Hover PEEKS and click PINS, but the exit is never hover-only: a chevron on each rail and an
 * always-visible control on the canvas. In a demo someone else may be driving, and a mode you
 * can only leave by discovering a hover target is a mode that traps a stranger in front of a
 * room.
 */
interface PresentationState {
  /** Rails collapsed to labelled strips, board takes the width. */
  fullScreen: boolean;
  /** A rail the reader pinned open. Survives losing hover; that is the whole point of a pin. */
  leftPinned: boolean;
  rightPinned: boolean;

  enterFullScreen: () => void;
  exitFullScreen: () => void;
  toggleFullScreen: () => void;
  toggleLeft: () => void;
  toggleRight: () => void;
  /** Open the HUD because the reader just selected a card. See revealRightOnSelection. */
  revealRight: () => void;
}

export const usePresentationStore = create<PresentationState>((set) => ({
  fullScreen: false,
  leftPinned: false,
  rightPinned: false,

  enterFullScreen: () => set({ fullScreen: true }),
  // LEAVING CLEARS THE PINS. A pin is a decision about a collapsed rail; carrying it out of
  // the mode would leave a flag set that nothing displays, and the next entry would open a
  // rail the reader never asked for in this session.
  exitFullScreen: () => set({ fullScreen: false, leftPinned: false, rightPinned: false }),
  toggleFullScreen: () =>
    set((s) =>
      s.fullScreen
        ? { fullScreen: false, leftPinned: false, rightPinned: false }
        : { fullScreen: true },
    ),
  toggleLeft: () => set((s) => ({ leftPinned: !s.leftPinned })),
  toggleRight: () => set((s) => ({ rightPinned: !s.rightPinned })),
  revealRight: () => set({ rightPinned: true }),
}));

/**
 * Whether a rail is showing, given the mode and what the reader is doing.
 *
 * Derived rather than stored, so there is no state to get out of sync and no effect to fire.
 *
 * THE RIGHT RAIL OPENS ON SELECTION — but selection is a MOMENT, not a state, and the first
 * version of this got that wrong in a way worth keeping written down.
 *
 * It read `Boolean(currentArtifactId)` as an input here. That is true from the first answer
 * onwards and never goes back to false, so the rail was permanently open and the mode gave the
 * board only the left rail's width back. The condition described "a card is current", which is
 * almost always; the intent was "a card was just chosen", which is almost never.
 *
 * So the transition drives it instead — see `revealRightOnSelection` — and this stays a pure
 * function of the mode, the pin and the pointer. The HUD is the evidence the system reasoned
 * rather than guessed, and the moment that matters is when someone asks "how did it know
 * that", which is a click. An answer list has no equivalent moment, so the left rail waits to
 * be asked for.
 */
export function railOpen(opts: {
  fullScreen: boolean;
  pinned: boolean;
  hovering: boolean;
}): boolean {
  if (!opts.fullScreen) return true;
  return opts.pinned || opts.hovering;
}

/**
 * Open the HUD when the reader CHANGES selection, and only then.
 *
 * A hook rather than a `railOpen` input because the trigger is a transition and `railOpen`
 * must stay a pure function of state. It pins rather than inventing a third visibility mode:
 * the reader closes it with the same chevron they would use for a rail they pinned themselves,
 * so there is one mechanism and not two that look alike.
 *
 * IT DOES NOT FIRE ON MOUNT. Entering presentation mode with a card already current is not a
 * request for context — it is the state the reader was already in, and opening the rail then
 * would reproduce the bug this replaced.
 */
export function revealRightOnSelection(currentArtifactId: string | null, fullScreen: boolean) {
  const seen = useRef<string | null | undefined>(undefined);
  const reveal = usePresentationStore((s) => s.revealRight);
  useEffect(() => {
    const first = seen.current === undefined;
    const changed = seen.current !== currentArtifactId;
    seen.current = currentArtifactId;
    if (first || !changed || !fullScreen || !currentArtifactId) return;
    reveal();
  }, [currentArtifactId, fullScreen, reveal]);
}
