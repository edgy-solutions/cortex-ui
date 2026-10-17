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
 * `loadMine` reads `GET /ingest/mine` once per session (191): the server's list of this person's drops,
 * which seeds `rows` and names the drops browser storage never held (`listed`). A row this tab already
 * holds wins while its `updated_at` is newer than the listed item's — the live poll is fresher than the
 * page. It follows `next` page by page (keyset: each page's `next` goes back as `before`): the first page
 * draws at once, older pages are appended as they come, up to `INGEST_MINE_MAX_PAGES`. A failure on a
 * LATER page stops the walk and keeps what was read; only the first page's failure is `failed`.
 *
 * The fetch is `fetchIngestStatus` from `ingestTransport` (the guarded transport) — no new site.
 * In-memory only; the sync hook drives it and `purgeUserScopedState` resets it, so A's rows never
 * paint for B.
 */
import { create } from "zustand";
import { fetchIngestMine, fetchIngestStatus, retryIngest } from "@/lib/ingestTransport";
import {
  INGEST_FAILED_TIMEOUT_POLL_MS,
  INGEST_FAILURE_TIMEOUT,
  ingestPollingDone,
  isIngestNotFoundError,
  readIngestErrorMessage,
  readIngestMinePage,
  readIngestRetryRefusal,
  readIngestStatusRow,
  type IngestStatusRow,
} from "@/lib/ingestWire";

export const INGEST_POLL_MS = 2000;
/** One page of `GET /ingest/mine`: the same count browser storage kept (`MY_DROPS_CAP`). */
export const INGEST_MINE_LIMIT = 50;
/** Pages `loadMine` follows at most (500 drops): past that the rail shows the newest 500. */
export const INGEST_MINE_MAX_PAGES = 10;

/** The listed item, unless this tab already holds a NEWER read of the same row. */
export function mergeListedRow(held: IngestStatusRow | undefined, listed: IngestStatusRow): IngestStatusRow {
  return held !== undefined && held.updated_at > listed.updated_at ? held : listed;
}

interface State {
  rows: Record<string, IngestStatusRow>;
  notFound: Record<string, true>;
  /** The ingest ids `GET /ingest/mine` listed, in its order (newest first); [] until it answers. */
  listed: string[];
  /** `idle` until `loadMine` runs; `loaded` once the FIRST page is read (older pages may still be
   *  coming); `failed` if the first page errs (a fleet before 191 has no route). */
  mine: "idle" | "loading" | "loaded" | "failed";
  /** +1 on every `reset`. Only ever grows, so a reader keyed on it re-runs even when `mine` went
   *  idle → loading → idle inside one effect flush (which no subscriber sees as a change). */
  epoch: number;
  /** Read `GET /ingest/mine` once per session (again after `reset`), following `next`. */
  loadMine: () => void;
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
  listed: [],
  mine: "idle",
  epoch: 0,
  loadMine: () => {
    if (get().mine !== "idle") return;
    set({ mine: "loading" });
    const gen = generation;
    const seen = new Set<string>(); // a cursor handed back twice would page forever
    const walk = async () => {
      let before: string | null = null;
      for (let n = 0; n < INGEST_MINE_MAX_PAGES; n++) {
        let page: ReturnType<typeof readIngestMinePage>;
        try {
          page = readIngestMinePage(await fetchIngestMine(INGEST_MINE_LIMIT, before));
        } catch {
          page = null;
        }
        if (gen !== generation) return;
        if (!page) {
          if (n === 0) set({ mine: "failed" });
          return; // a later page's failure keeps what was read
        }
        const items = page.items;
        set((s) => {
          const rows = { ...s.rows };
          for (const item of items) rows[item.ingest_id] = mergeListedRow(rows[item.ingest_id], item);
          const listed = n === 0 ? [] : [...s.listed];
          for (const item of items) if (!listed.includes(item.ingest_id)) listed.push(item.ingest_id);
          return { rows, listed, mine: "loaded" };
        });
        if (page.next === null || seen.has(page.next)) return;
        seen.add(page.next);
        before = page.next;
      }
    };
    void walk();
  },
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
    set((s) => ({ rows: {}, notFound: {}, listed: [], mine: "idle", epoch: s.epoch + 1 }));
  },
}));
