import type { Artifact } from "@/api/types";
import type { UpdateSource } from "@/store/useCanvasStore";
import { isIngestArtifact } from "@/lib/ingestArtifact";

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

/** Whether an answer's body (`rendered_output`, `routing`, `resolved_intent`) has been read. A missing key is `absent`. */
export type BodyState = "absent" | "loading" | "loaded" | "failed";

/** One paged view of `/answers` (the unfiltered list, or a search). `frontier` is the `ts` of the oldest item loaded. */
export interface AnswerPaging {
  status: "idle" | "loading" | "loaded" | "failed";
  loaded: number;
  total: number | null;
  nextPage: number;
  frontier: number | null;
}
export const INITIAL_ANSWER_PAGING: AnswerPaging = { status: "idle", loaded: 0, total: null, nextPage: 1, frontier: null };

/** A server search: its own pages, and the ids they listed (the rail lists exactly these while it is set). */
export interface AnswerSearch extends AnswerPaging {
  q: string;
  ids: string[];
}

/** The six columns a summary-only change feed does not carry; a loaded body keeps them across an upsert. */
export const BODY_FIELDS = [
  "rendered_output",
  "routing",
  "resolved_intent",
  "sources",
  "graph_trace",
  "graph_trace_alternates",
] as const satisfies readonly (keyof Artifact)[];

export interface ElectricSlice {
  artifacts: Artifact[];
  currentArtifactId: string | null;
  currentArtifactSetByUser: boolean;
  _lastUpdateSource: Record<string, Partial<Record<keyof Artifact, UpdateSource>>>;
  /** Summaries mode only (the `answerSummaries` flag); absent keys read as `absent`. */
  bodies?: Record<string, BodyState>;
  subjects?: Record<string, { uri: string; label: string }>;
  answerPaging?: AnswerPaging;
  answerSearch?: AnswerSearch | null;
}

export interface ApplyOptions {
  /** The feed carries summary columns only: a loaded body survives an upsert, and a reset clears paging. */
  summaries?: boolean;
}

/**
 * Summaries mode: drop a live upsert for a row OLDER than the frontier whose id is not already
 * held. It arrives when its page is loaded; an update to a held id, and anything at or newer than
 * the frontier, passes. No frontier (page 1 not read, or it failed) filters nothing.
 */
export function filterLiveOps(
  ops: readonly ElectricOp[],
  frontier: number | null,
  held: ReadonlySet<string>,
): ElectricOp[] {
  if (frontier === null) return ops.slice();
  return ops.filter((op) => op.kind !== "upsert" || op.artifact.created_at >= frontier || held.has(op.artifact.id));
}

const ELECTRIC_TAG: UpdateSource = "electric:answer_artifact_projection";

export function applyElectricOps(
  state: ElectricSlice,
  ops: readonly ElectricOp[],
  opts: ApplyOptions = {},
): Partial<ElectricSlice> {
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
  let cleared = false;

  const highest = (): string | null => {
    let best: Artifact | null = null;
    // A drop is the user's own turn, not a streamed answer: it never wins the auto-foreground.
    for (const a of arr) if (a && !isIngestArtifact(a) && (best === null || a.watermark > best.watermark)) best = a;
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
      // Drops are client-made (no Electric shape carries them) and nothing re-sends them after a
      // refetch, so a reset keeps them.
      for (const a of arr.slice()) if (a && a.status !== "pending" && !isIngestArtifact(a)) remove(a.id);
      if (opts.summaries) {
        cleared = true;
        changed = true;
      }
    } else {
      const artifact = op.artifact;
      const prevSource = sources[artifact.id] ?? {};
      const nextSource: Partial<Record<keyof Artifact, UpdateSource>> = { ...prevSource };
      for (const k of Object.keys(artifact) as (keyof Artifact)[]) nextSource[k] = ELECTRIC_TAG;
      const i = index.get(artifact.id);
      if (i !== undefined) {
        const existing = arr[i]!;
        // A summary-only row has no body columns: a body already read must survive it.
        const keep: Partial<Artifact> = {};
        if (opts.summaries && state.bodies?.[artifact.id] === "loaded") {
          for (const f of BODY_FIELDS) (keep as Record<string, unknown>)[f] = existing[f];
        }
        arr[i] = {
          ...existing,
          ...artifact,
          ...keep,
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
    ...(cleared ? { bodies: {}, subjects: {}, answerPaging: INITIAL_ANSWER_PAGING, answerSearch: null } : {}),
  };
}
