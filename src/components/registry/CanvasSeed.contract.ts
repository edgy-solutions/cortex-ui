/**
 * CANVAS_SEED — the first archetype that is ACTED ON rather than DRAWN.
 *
 * "make me a portfolio canvas" routes, a BFF orchestration asks the five standing planning
 * questions through the governed path, and the answer comes back carrying their artifact ids in
 * slot order. Nothing renders that answer as a card. `canvasSeedFromArtifact` reads it and
 * arranges the five artifacts onto a canvas.
 *
 * ── WHY THIS DECLARES A `consumer` AND NOT A `component` ─────────────────────────────────────
 *
 * Every other contract names a component, and the dispatch seal checks that
 * `SemanticInterpreter` actually renders it — the guard that caught PROCESS_TOPOLOGY still
 * advertising `WorkflowCanvas` two months after the interpreter had moved on.
 *
 * This archetype has no component. The tempting shortcut was to invent one — a contract naming
 * some placeholder so the existing seal would pass. **That is `classification-is-not-existence`
 * committed on purpose**: asserting a renderable thing exists when nothing draws it, one day
 * after sealing against exactly that confusion between a class existing and a class being the
 * right KIND of thing.
 *
 * So the model gains the category instead. A binding declares ONE of:
 *
 *     component: "IntervalTimeline"        the answer is DRAWN     → checked against the interpreter
 *     consumer:  "canvasSeedFromArtifact"  the answer is ACTED ON  → checked against the module
 *
 * Both are enumerable, and neither impersonates the other. A consumer that stops existing fails
 * its own check exactly as a stale component name does.
 *
 * ── THE PAYLOAD SHAPE IS NOT DECLARED HERE ───────────────────────────────────────────────────
 *
 * `canvasSeedFromArtifact` states it, and says so in its own header: "the expectation is stated
 * in ONE function and nowhere else". This contract mirrors that shape for the registry's
 * benefit — it does not become a second place the shape is decided. If the two ever disagree,
 * the function is right and this is stale, which is the same direction every other contract
 * points (the component owns its acceptance rules; the contract publishes them).
 */

/** What the seeding answer carries. Ordered — the order IS the slot assignment. */
export const CANVAS_SEED_CONTRACT = {
  archetype: "CANVAS_SEED",
  /**
   * NOT `component`. See the header. The name is the exported reader in
   * `src/lib/canvasSeedFromAnswer.ts`, and the seal checks it is really exported from there.
   */
  consumer: "canvasSeedFromArtifact",
  layout: "none",
  /**
   * ADR-0042 Ruling 9's discriminant. FALSE — and not for the usual reason.
   *
   * A live view recomputes because its content is a function of plan state that can move. A
   * seed answer is a RECORD OF AN ACT: these five artifacts were minted, in this order, at that
   * moment. Re-evaluating it would either mint five more or return the same five, and the first
   * is a duplicate board while the second is a request that did nothing. Neither is a refresh.
   */
  recomputes: false,
  fields: {
    /**
     * Slot-ordered artifact ids. The ORDER is the producer's declaration of which measure
     * lands in which slot, so it is load-bearing rather than incidental.
     *
     * A HOLE IS NOT ALLOWED TO ARRIVE AS A HOLE. `canvasSeedFromArtifact` filters non-strings
     * defensively, because an item pointing at no artifact renders as a slot-shaped gap with
     * nothing explaining it. Whether a PARTIAL seed should compose at all — or refuse — is a
     * product ruling that belongs to the route, not here.
     */
    artifact_ids: { encoding: "array", parsesTo: "array-of-strings", required: true },
    /** What to call the canvas. Absent means the consumer's default. */
    name: { type: "string", required: false },
    /** Which template. Only `portfolio_planning` has one today; the route refuses others. */
    canvas_type: { type: "string", required: false },
  },
  refusalReasons: [
    "no surviving artifact ids — a seed that placed nothing is not a seed",
  ],
} as const;

export type CanvasSeedContract = typeof CANVAS_SEED_CONTRACT;
