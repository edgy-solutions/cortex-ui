/**
 * Mirror this user's drops into synthetic ingest-artifacts in the canvas store, so a drop is a
 * TURN on the answers rail (`ingestArtifact.ts`), and drive the one status poller
 * (`useIngestStatusStore`). Mount once (App), as `useTaskArtifactSync` is.
 *
 * Sources, in order of authority:
 *  - the composer's in-memory turns (`useIngestComposerStore`): uploading, errored, duplicate;
 *  - `GET /ingest/mine` (`useIngestStatusStore.listed`, 191): the record — every drop of this
 *    person's the server lists. `myDrops` (localStorage, per `sub`) is a cache of the FILENAME
 *    only, which the status body does not carry; it is never a source of ids.
 * A drop appears once: a turn that holds an ingest id hides the listed drop with that id.
 *
 * The entry's key is the INGEST id once the server has given one, so a drop keeps its
 * `ingest:` id across a reload (where only the stored list remains). Before that — uploading,
 * refused — it is the turn id. A duplicate carries its ORIGINAL's id, so it stays on its turn
 * id; after a reload the stored list folds it into the original, as it always has.
 */
import { useEffect, useMemo } from "react";
import { useAuth } from "react-oidc-context";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";
import { INGEST_POLL_MS, useIngestStatusStore } from "@/store/useIngestStatusStore";
import { readMyDrops } from "@/lib/myDrops";
import { ingestArtifactId, ingestToArtifact, type IngestEntry } from "@/lib/ingestArtifact";
import type { IngestTurn } from "@/store/useIngestComposerStore";

export function useIngestArtifactSync(): void {
  const owner = useAuth().user?.profile?.sub ?? null;
  const turns = useIngestComposerStore((s) => s.turns);
  const rows = useIngestStatusStore((s) => s.rows);
  const notFound = useIngestStatusStore((s) => s.notFound);
  const listed = useIngestStatusStore((s) => s.listed);
  const tracked = useIngestStatusStore((s) => s.tracked);
  const reconcile = useCanvasStore((s) => s.reconcileIngestArtifacts);

  // `submit` records the drop BEFORE it patches the turn, so a change of `turns` is when the
  // stored list has changed too.
  const drops = useMemo(() => readMyDrops(owner), [owner, turns]);

  // Read the server's list once a person is signed in; storage is the cache, this is the record.
  // Keyed on `epoch` too: the owner purge (`reconcileSessionOwner`, a PARENT effect, so it runs
  // after this one) resets the store and discards the read in flight — this reads again. Not keyed
  // on `mine`: it goes idle → loading → idle inside that one flush, which no subscriber sees.
  const epoch = useIngestStatusStore((s) => s.epoch);
  useEffect(() => {
    if (owner) useIngestStatusStore.getState().loadMine();
  }, [owner, epoch]);

  const ids = useMemo(() => {
    const out = new Set<string>();
    for (const t of turns) if (t.ingestId) out.add(t.ingestId);
    for (const id of listed) out.add(id);
    // Ids a card registered via `useDocument` (a review card's drop need not be on the rail).
    for (const id of tracked) out.add(id);
    return [...out];
  }, [turns, drops, listed, tracked]);
  const idsKey = ids.join("\n");

  useEffect(() => {
    const { pollDue } = useIngestStatusStore.getState();
    pollDue(ids);
    const timer = setInterval(() => pollDue(ids), INGEST_POLL_MS);
    return () => clearInterval(timer);
    // `ids` is rebuilt every render; the key is its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  useEffect(() => {
    const covered = new Set(turns.map((t) => t.ingestId).filter((x): x is string => x !== null));
    const filenames = new Map(drops.map((d) => [d.ingestId, d.filename] as const));
    const keys = turnKeys(turns);
    const renamed: Record<string, string> = {};
    for (const t of turns) {
      const key = keys.get(t.id)!;
      if (key !== t.id) renamed[ingestArtifactId(t.id)] = ingestArtifactId(key);
    }
    const entries: IngestEntry[] = [
      ...turns.map((t) => ({
        key: keys.get(t.id)!,
        filename: t.fileName,
        kind: t.kind,
        droppedAt: t.createdAt,
        phase: t.phase,
        ingestId: t.ingestId,
        error: t.error,
        refusal: t.refusal ?? null,
        acceptedThisSession: t.phase === "status",
        duplicate: t.duplicate,
        note: t.text,
        row: t.ingestId ? rows[t.ingestId] ?? null : null,
        notFound: t.ingestId ? !!notFound[t.ingestId] : false,
      })),
      ...listed
        .filter((id) => !covered.has(id) && rows[id] !== undefined)
        .map((id) => ({
          key: id,
          filename: filenames.get(id) ?? "", // the status body carries none; the myDrops cache may; else `ingestToArtifact` leads with the notice id or a short id
          kind: null,
          droppedAt: rows[id]!.created_at,
          phase: "status" as const,
          ingestId: id,
          error: null,
          acceptedThisSession: false,
          duplicate: null,
          note: null,
          row: rows[id]!,
          notFound: !!notFound[id],
        })),
    ];
    reconcile(entries.map(ingestToArtifact), renamed);
  }, [turns, drops, listed, rows, notFound, reconcile]);
}

/**
 * Each turn's entry key: its ingest id when the server gave one and the drop is not a
 * duplicate, else its turn id. A key already taken (two turns naming one ingest id) falls back
 * to the turn id, so no two entries ever share an artifact id.
 */
export function turnKeys(turns: readonly Pick<IngestTurn, "id" | "ingestId" | "duplicate">[]): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  for (const t of turns) {
    const want = t.ingestId && !t.duplicate ? t.ingestId : t.id;
    const key = taken.has(want) ? t.id : want;
    taken.add(key);
    out.set(t.id, key);
  }
  return out;
}
