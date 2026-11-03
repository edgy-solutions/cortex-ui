/**
 * PROPOSED — cortex's names, asked of lane 01 in invincible-agent `sessions/2026-10-31-packet-to-lane-01-from-cortex-the-new-canvas-dialog-needs-per-panel-seed-progress.md`. Nothing serves this yet. When lane 01's form lands, rename the fields HERE and nowhere else.
 *
 * `POST /canvas/seed` is one synchronous call that answers only at the end, so the live path
 * never produces a `SeedPanelEvent` and the dialog must not show a k it was not told. This file
 * is the reader and the fold for the day it does.
 */

export type SeedPanelEvent = {
  panel_index: number;
  total: number;
  outcome: "artifact" | "refused";
  artifact_id?: string;
  refusal?: unknown;
};

/** Accepts only a well-formed event; anything else is null so the caller ignores it. */
export function readSeedPanelEvent(v: unknown): SeedPanelEvent | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const { panel_index: i, total: t, outcome } = o;
  if (typeof i !== "number" || !Number.isInteger(i) || i < 0) return null;
  if (typeof t !== "number" || !Number.isInteger(t) || t <= 0 || i >= t) return null;
  if (outcome !== "artifact" && outcome !== "refused") return null;
  const e: SeedPanelEvent = { panel_index: i, total: t, outcome };
  if (typeof o.artifact_id === "string") e.artifact_id = o.artifact_id;
  if ("refusal" in o) e.refusal = o.refusal;
  return e;
}

export type SeedProgress = { total: number; panels: Record<number, "seeded" | "refused"> };

export function foldSeedPanel(p: SeedProgress | null, e: SeedPanelEvent): SeedProgress {
  // THE FIRST TOTAL STANDS. A later event naming a different total is not a second fixture size;
  // taking the latest drew "6 of 5" against a list already laid out for six.
  if (p && e.total !== p.total) return p;
  const panels = { ...(p?.panels ?? {}) };
  // An index already recorded keeps its first word: a repeat is not a second panel.
  if (!(e.panel_index in panels)) panels[e.panel_index] = e.outcome === "artifact" ? "seeded" : "refused";
  return { total: e.total, panels };
}

export const seedDone = (p: SeedProgress): number => Object.keys(p.panels).length;

/** How many of the recorded panels were refused. */
export const seedRefused = (p: SeedProgress): number =>
  Object.values(p.panels).filter((s) => s === "refused").length;

const panelEvents = (refused: number[]): SeedPanelEvent[] =>
  [0, 1, 2, 3, 4, 5].map((i) =>
    refused.includes(i)
      ? { panel_index: i, total: 6, outcome: "refused" }
      : { panel_index: i, total: 6, outcome: "artifact", artifact_id: `fx-panel-${i}` },
  );

/** Six events for `program_finance`, all seeded. */
export const PROPOSED_SEED_PROGRESS_FIXTURE: SeedPanelEvent[] = panelEvents([]);
/** The same six with panels 2 and 4 refused. */
export const PROPOSED_SEED_PROGRESS_PARTIAL: SeedPanelEvent[] = panelEvents([2, 4]);
