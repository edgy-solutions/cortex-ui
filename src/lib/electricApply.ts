import type { Artifact } from "@/api/types";
import type { UpdateSource } from "@/store/useCanvasStore";

/**
 * The Electric ingest as a PURE function, so one `subscribe` batch is ONE `set()`.
 *
 * Before: one `set()` per message, each with a `findIndex` and a `.map` over the whole array -
 * O(N^2) copies and N subscriber notifications per snapshot (the 20 s long task at 10,000 rows).
 * Now the per-row merge lives here ONCE; the single-row action and the batch action both call it,
 * so there is nothing to fork. Ops are applied IN ORDER with an id -> index Map, and the result is
 * the same state the one-at-a-time path produces (asserted by electricApply.test.ts).
 */
export type ElectricOp =
  | { kind: "upsert"; artifact: Artifact }
  | { kind: "remove"; id: string }
  /** `must-refetch`: drop every non-pending row, keep pending client-created ones. */
  | { kind: "reset" };

export interface ElectricSlice {
  artifacts: Artifact[];
  currentArtifactId: string | null;
  currentArtifactSetByUser: boolean;
  _lastUpdateSource: Record<string, Partial<Record<keyof Artifact, UpdateSource>>>;
}

const ELECTRIC_TAG: UpdateSource = "electric:answer_artifact_projection";

export function applyElectricOps(state: ElectricSlice, ops: readonly ElectricOp[]): Partial<ElectricSlice> {
  if (ops.length === 0) return {};
  // Working copies, made once. `arr` holds tombstones (null) so a remove does not shift indices.
  const arr: (Artifact | null)[] = state.artifacts.slice();
  const index = new Map<string, number>();
  for (let i = 0; i < arr.length; i++) index.set(arr[i]!.id, i);
  const sources = { ...state._lastUpdateSource };
  let current = state.currentArtifactId;
  let setByUser = state.currentArtifactSetByUser;
  /** An upsert wants "highest watermark" recomputed; deferred until something needs the value. */
  let dirty = false;
  let changed = false;

  const highest = (): string | null => {
    let best: Artifact | null = null;
    for (const a of arr) if (a && (best === null || a.watermark > best.watermark)) best = a;
    return best ? best.id : null;
  };
  const resolve = () => {
    if (dirty) {
      current = highest();
      dirty = false;
    }
  };

  const remove = (id: string) => {
    const i = index.get(id);
    if (i === undefined) return;
    resolve();
    arr[i] = null;
    index.delete(id);
    delete sources[id];
    changed = true;
    if (current === id) {
      current = null;
      setByUser = false;
    }
  };

  for (const op of ops) {
    if (op.kind === "remove") {
      remove(op.id);
    } else if (op.kind === "reset") {
      for (const a of arr.slice()) if (a && a.status !== "pending") remove(a.id);
    } else {
      const artifact = op.artifact;
      const prevSource = sources[artifact.id] ?? {};
      const nextSource: Partial<Record<keyof Artifact, UpdateSource>> = { ...prevSource };
      for (const k of Object.keys(artifact) as (keyof Artifact)[]) nextSource[k] = ELECTRIC_TAG;
      const i = index.get(artifact.id);
      if (i !== undefined) {
        const existing = arr[i]!;
        arr[i] = {
          ...existing,
          ...artifact,
          // Preserve locally-captured invariants - question_text + message_id are set at
          // create-pending and the user is already seeing them; the projection echoes them but a
          // future schema drift must not wipe them.
          question_text: existing.question_text || artifact.question_text,
          message_id: existing.message_id || artifact.message_id,
          // CLIENT-ONLY: what THIS client sent. The projection has no column for it; the day a
          // mapper emits `answered_with: undefined` the chip would vanish mid-flight.
          answered_with: existing.answered_with ?? artifact.answered_with ?? null,
          updated_at: Date.now(),
        };
      } else {
        arr.push(artifact);
        index.set(artifact.id, arr.length - 1);
      }
      sources[artifact.id] = nextSource;
      changed = true;
      // Until the user chooses, foreground the highest-watermark row (Electric streams in
      // apply-order; a first-row-wins rule locks to the OLDEST). Recomputed lazily.
      if (!setByUser) dirty = true;
    }
  }
  if (!changed) return {};
  resolve();
  return {
    artifacts: arr.filter((a): a is Artifact => a !== null),
    currentArtifactId: current,
    currentArtifactSetByUser: setByUser,
    _lastUpdateSource: sources,
  };
}
