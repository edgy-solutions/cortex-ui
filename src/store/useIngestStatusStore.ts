/**
 * useIngestStatusStore — the ONE poller for `GET /ingest/{id}/status`.
 *
 * A drop is a rail entry (`ingestArtifact.ts`) and its status card opens from the same row, so the
 * row lives here, keyed by ingest id, and both read it. Nothing else polls a drop shown in the rail.
 *
 *  - an in-flight drop (not terminal per `ingestPollingDone`) is fetched every `INGEST_POLL_MS`;
 *  - a terminal drop is fetched ONCE (to show its stage) and never again — except a `failed` drop
 *    whose reason_code is `timeout`, which a late run can still advance: it is re-read every
 *    `INGEST_FAILED_TIMEOUT_POLL_MS`;
 *  - SINGLE-FLIGHT per id: a slow response is not overtaken by the next tick;
 *  - a 404 ("not found, or not yours", existence-oracle safe) stops that id; any other transport
 *    error is tolerated and retried on the next tick.
 *
 * The fetch is `fetchIngestStatus` from `ingestTransport` (the guarded transport) — no new site.
 * In-memory only; the sync hook drives it and `purgeUserScopedState` resets it, so A's rows never
 * paint for B.
 */
import { create } from "zustand";
import { fetchIngestStatus, retryIngest } from "@/lib/ingestTransport";
import {
  INGEST_FAILED_TIMEOUT_POLL_MS,
  INGEST_FAILURE_TIMEOUT,
  ingestPollingDone,
  isIngestNotFoundError,
  readIngestErrorMessage,
  readIngestRetryRefusal,
  readIngestStatusRow,
  type IngestStatusRow,
} from "@/lib/ingestWire";

export const INGEST_POLL_MS = 2000;

interface State {
  rows: Record<string, IngestStatusRow>;
  notFound: Record<string, true>;
  /** Fetch every id in `ids` that is due: never read, or read and still not terminal. */
  pollDue: (ids: readonly string[]) => void;
  /** Re-open the person's own failed drop. The UI shows `message` on refusal. */
  retry: (id: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  reset: () => void;
}

const inFlight = new Set<string>();
/** When each id was last requested (ms), for the slow cadence of a failed+timeout row. */
const lastFetchedAt = new Map<string, number>();
/** Bumped by `reset`: a response that left before a purge must not repopulate after it. */
let generation = 0;

export const useIngestStatusStore = create<State>()((set, get) => ({
  rows: {},
  notFound: {},
  pollDue: (ids) => {
    for (const id of ids) {
      const { rows, notFound } = get();
      if (notFound[id] || inFlight.has(id)) continue;
      const row = rows[id];
      if (row !== undefined && ingestPollingDone(row)) continue;
      if (
        row !== undefined &&
        row.stage === "failed" &&
        row.failure?.reason_code === INGEST_FAILURE_TIMEOUT &&
        Date.now() - (lastFetchedAt.get(id) ?? 0) < INGEST_FAILED_TIMEOUT_POLL_MS
      ) {
        continue;
      }
      lastFetchedAt.set(id, Date.now());
      inFlight.add(id);
      const gen = generation;
      void fetchIngestStatus(id)
        .then((raw) => {
          if (gen !== generation) return;
          const next = readIngestStatusRow(raw);
          if (next) set((s) => ({ rows: { ...s.rows, [id]: next } }));
        })
        .catch((err: unknown) => {
          if (gen === generation && isIngestNotFoundError(err)) set((s) => ({ notFound: { ...s.notFound, [id]: true } }));
        })
        .finally(() => {
          if (gen === generation) inFlight.delete(id);
        });
    }
  },
  retry: async (id) => {
    const gen = generation;
    try {
      const raw = await retryIngest(id);
      if (gen !== generation) return { ok: true };
      const row = get().rows[id];
      const a = (raw as { attempt?: unknown } | null)?.attempt;
      const attempt = typeof a === "number" && Number.isInteger(a) && a > 0 ? a : row?.attempt;
      if (row) {
        set((s) => ({
          rows: { ...s.rows, [id]: { ...row, stage: "received", ...(attempt !== undefined ? { attempt } : {}), failure: null } },
        }));
      }
      return { ok: true };
    } catch (err: unknown) {
      const refusal = readIngestRetryRefusal(err);
      if (refusal?.status === 409 && refusal.error === "not_failed") {
        // It moved since it was read: re-read now, ignoring the cadence and any fetch in flight.
        inFlight.delete(id);
        lastFetchedAt.delete(id);
        void fetchIngestStatus(id)
          .then((raw) => {
            if (gen !== generation) return;
            const next = readIngestStatusRow(raw);
            if (next) set((s) => ({ rows: { ...s.rows, [id]: next } }));
          })
          .catch(() => undefined);
        return { ok: false, message: "It moved since it was read — refreshed." };
      }
      if (refusal?.status === 403) return { ok: false, message: "This drop can’t be retried from here." };
      return { ok: false, message: readIngestErrorMessage(err) ?? "Retry failed." };
    }
  },
  reset: () => {
    generation++;
    inFlight.clear();
    lastFetchedAt.clear();
    set({ rows: {}, notFound: {} });
  },
}));
