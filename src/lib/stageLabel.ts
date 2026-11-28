/**
 * WHAT A STAGE IS CALLED, AND WHICH STAGES ARE DRAWN BEFORE THEY ARRIVE.
 *
 * Rows, not branches ("config names the case"). Two kinds of known stage:
 *
 * - The canonical five (`PIPELINE_STAGES`). The client SEEDS them before any event arrives, so
 *   the strip can show "Stage 1/5" from the first frame.
 * - ARRIVED-ONLY stages. Known by name, but never seeded: they are drawn only once the server
 *   reports them. `waiting` ("Waiting to start", lane 74's #595) is the first. A seeded row is one
 *   the server must complete. A server without that PR never would, and every answer on it would
 *   read "Waiting to start" throughout. Approved by the architect, 2026-11-27.
 *
 * An UNKNOWN stage shows its own name, or a neutral "Working", and never another stage's label
 * (architect, 2026-11-27). The stream handler used to label every unknown kind "Composing the
 * answer", so a stage cortex had not heard of claimed to be the last one.
 */
import { PIPELINE_STAGES } from "@/api/types";

/**
 * Known stages drawn only once they arrive. WHERE one is drawn is not declared here: it is drawn
 * where it was reported (see `deriveStages`), because #595 sends `waiting` in two places. On the
 * run path it follows `understanding`; on the admission queue it comes first and `understanding`
 * starts only once the answer is admitted. A fixed position would be wrong for one of them.
 */
export const ARRIVED_ONLY_STAGES: readonly { kind: string; label: string }[] = [
  { kind: "waiting", label: "Waiting to start" },
];

/** Every known stage: the canonical five in their order, then the arrived-only rows. */
export const KNOWN_STAGES: readonly { kind: string; label: string; arrivedOnly: boolean }[] = [
  ...PIPELINE_STAGES.map((s) => ({ kind: s.kind as string, label: s.label, arrivedOnly: false })),
  ...ARRIVED_ONLY_STAGES.map((s) => ({ ...s, arrivedOnly: true })),
];

const LABELS: ReadonlyMap<string, string> = new Map(KNOWN_STAGES.map((s) => [s.kind, s.label]));

/** The neutral label for a stage that has no name cortex can show. */
export const UNNAMED_STAGE_LABEL = "Working";

/**
 * The label for a stage kind: the table's when known, else the kind's own name made readable
 * ("route_confirm" → "Route confirm"), else "Working".
 */
export function stageLabel(kind: string | null | undefined): string {
  if (typeof kind !== "string") return UNNAMED_STAGE_LABEL;
  const known = LABELS.get(kind);
  if (known) return known;
  const words = kind.replace(/[_\-.]+/g, " ").trim().replace(/\s+/g, " ");
  if (!words) return UNNAMED_STAGE_LABEL;
  return words.charAt(0).toUpperCase() + words.slice(1);
}
