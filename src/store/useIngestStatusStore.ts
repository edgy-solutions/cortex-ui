/**
 * useIngestStatusStore — the ONE poller for `GET /ingest/{id}/status`.
 *
 * A drop is a rail entry (`ingestArtifact.ts`) and its status card opens from the same row, so the
 * row lives here, keyed by ingest id, and both read it. Nothing else polls a drop shown in the rail.
 *
 *  - an in-flight drop (not terminal per `ingestPollingDone`) is fetched every `INGEST_POLL_MS`;
 *  - a terminal drop is fetched ONCE (to show its stage) and never again;
 *  - SINGLE-FLIGHT per id: a slow response is not overtaken by the next tick;
 *  - a 404 ("not found, or not yours", existence-oracle safe) stops that id; any other transport
 *    error is tolerated and retried on the next tick.
 *
 * The fetch is `fetchIngestStatus` from `ingestTransport` (the guarded transport) — no new site.
 * In-memory only; the sync hook drives it and `purgeUserScopedState` resets it, so A's rows never
 * paint for B.
 */
import { create } from "zustand";
import { fetchIngestStatus } from "@/lib/ingestTransport";
import { ingestPollingDone, isIngestNotFoundError, readIngestStatusRow, type IngestStatusRow } from "@/lib/ingestWire";

export const INGEST_POLL_MS = 2000;

interface State {
  rows: Record<string, IngestStatusRow>;
  notFound: Record<string, true>;
  /** Fetch every id in `ids` that is due: never read, or read and still not terminal. */
  pollDue: (ids: readonly string[]) => void;
  reset: () => void;
}

const inFlight = new Set<string>();
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
  reset: () => {
    generation++;
    inFlight.clear();
    set({ rows: {}, notFound: {} });
  },
}));
