import { create } from "zustand";

/**
 * useStageStore — the CAMERA-STAGE navigation state for the center canvas
 * (ADR-0028 canvas-dock model). This is EPHEMERAL view state (which card is
 * zoomed, whether we're in full-pane), not answer data and not the pinned-set —
 * so it has no persistence. It is the "one space, one camera" navigation:
 * overview (zoomed out) ↔ focus (zoomed to a card) ↔ full-pane (card fills the
 * center). Custom canvases + the dock arrive in a later stage; Stage 1 is the
 * GLOBAL stage only.
 */
export type StageFocusTab = "answer" | "map";

interface StageState {
  /** The zoomed-in card (global overview → focus). null = overview. */
  focusId: string | null;
  /** Double-click state: the focused card fills the entire center pane
   *  (the pre-canvas single-answer view). Only meaningful with a focusId. */
  fullPane: boolean;
  /** At focus, the Answer / Decision-Map peer views toggle over the card. */
  focusTab: StageFocusTab;

  /** Zoom the camera to a card (resets the peer-view to Answer). */
  focus: (id: string) => void;
  /** Zoom back out to the overview (also exits full-pane). */
  clearFocus: () => void;
  /** Double-click → card fills the center pane. */
  openFullPane: () => void;
  /** Leave full-pane back to the zoomed-card focus. */
  closeFullPane: () => void;
  setFocusTab: (t: StageFocusTab) => void;
}

export const useStageStore = create<StageState>((set) => ({
  focusId: null,
  fullPane: false,
  focusTab: "answer",

  focus: (id) => set({ focusId: id, focusTab: "answer" }),
  clearFocus: () => set({ focusId: null, fullPane: false }),
  openFullPane: () => set({ fullPane: true }),
  closeFullPane: () => set({ fullPane: false }),
  setFocusTab: (t) => set({ focusTab: t }),
}));
