import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * useAnswerPanelStore — the answer-first left column's *view* state,
 * kept DELIBERATELY separate from useCanvasStore.
 *
 * useCanvasStore holds the durable, Electric-synced artifact COLLECTION
 * (the answers themselves) and has NO persist middleware — it hydrates
 * from Postgres via the Electric subscription. This store holds only the
 * PANEL's local view preferences (sort mode, which answers are pinned to
 * the personal canvas, whether the unresolved group is expanded). Those
 * are per-user UI choices, not answer data, so they persist to
 * localStorage (mirrors the mock's `cortex-answers-proto-v1`) and never
 * touch the answer collection.
 *
 * ADR-0028 v1 scope: this is the MINIMAL surface — sort + pins + the
 * unresolved-group toggle. NOT aggregation (v2) or workflow-seeding (v3).
 * Search is ephemeral (not persisted). The canvas TRAY (◈ batch-collect)
 * is deferred to v1.1 — v1 ships drag-to-canvas only.
 */

export type AnswerSortMode = "TIME" | "TOPIC" | "TYPE";

/** One pinned answer on the personal canvas. `x`/`y` are the drop
 *  position in canvas-local px; `z` is the stacking order (drag-to-front
 *  bumps it to the current max). `answerId` references an Artifact.id. */
export interface AnswerPin {
  answerId: string;
  x: number;
  y: number;
  z: number;
}

interface AnswerPanelState {
  /** Active grouping/sort of the list. Persisted. */
  sortMode: AnswerSortMode;
  /** Answers pinned to the personal canvas. Persisted. */
  pins: AnswerPin[];
  /** Whether the collapsed "unresolved (N)" group is expanded. Persisted.
   *  Default FALSE — dead-ends are collapsed-but-counted by default (the
   *  honest-not-hidden hinge: the count shows even when collapsed). */
  unresolvedExpanded: boolean;
  /** Ephemeral free-text filter (summary + question). NOT persisted. */
  search: string;
  /** Whether the personal-canvas overlay is open. Ephemeral (a view
   *  toggle, not a preference) — NOT persisted. */
  canvasOpen: boolean;

  setSortMode: (mode: AnswerSortMode) => void;
  setCanvasOpen: (open: boolean) => void;
  pinAnswer: (answerId: string, x: number, y: number) => void;
  unpinAnswer: (answerId: string) => void;
  movePin: (answerId: string, x: number, y: number) => void;
  /** Bump a pin to the front (highest z). */
  bringPinToFront: (answerId: string) => void;
  toggleUnresolved: () => void;
  setSearch: (q: string) => void;
}

const _maxZ = (pins: AnswerPin[]): number =>
  pins.reduce((m, p) => Math.max(m, p.z), 0);

export const useAnswerPanelStore = create<AnswerPanelState>()(
  persist(
    (set) => ({
      sortMode: "TIME",
      pins: [],
      unresolvedExpanded: false,
      search: "",
      canvasOpen: false,

      setSortMode: (mode) => set({ sortMode: mode }),
      setCanvasOpen: (open) => set({ canvasOpen: open }),

      pinAnswer: (answerId, x, y) =>
        set((s) => {
          // Idempotent: pinning an already-pinned answer just moves it
          // and brings it to front (drag-to-canvas of a pinned row).
          const existing = s.pins.find((p) => p.answerId === answerId);
          const z = _maxZ(s.pins) + 1;
          if (existing) {
            return {
              pins: s.pins.map((p) =>
                p.answerId === answerId ? { ...p, x, y, z } : p
              ),
            };
          }
          return { pins: [...s.pins, { answerId, x, y, z }] };
        }),

      unpinAnswer: (answerId) =>
        set((s) => ({ pins: s.pins.filter((p) => p.answerId !== answerId) })),

      movePin: (answerId, x, y) =>
        set((s) => ({
          pins: s.pins.map((p) =>
            p.answerId === answerId ? { ...p, x, y } : p
          ),
        })),

      bringPinToFront: (answerId) =>
        set((s) => {
          const z = _maxZ(s.pins) + 1;
          return {
            pins: s.pins.map((p) =>
              p.answerId === answerId ? { ...p, z } : p
            ),
          };
        }),

      toggleUnresolved: () =>
        set((s) => ({ unresolvedExpanded: !s.unresolvedExpanded })),

      setSearch: (q) => set({ search: q }),
    }),
    {
      name: "cortex-answers-panel-v1",
      // Persist view prefs + pins; NEVER the ephemeral search box.
      partialize: (s) => ({
        sortMode: s.sortMode,
        pins: s.pins,
        unresolvedExpanded: s.unresolvedExpanded,
      }),
    }
  )
);
