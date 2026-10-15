/**
 * Mirror this user's drops into synthetic ingest-artifacts in the canvas store, so a drop is a
 * TURN on the answers rail (`ingestArtifact.ts`), and drive the one status poller
 * (`useIngestStatusStore`). Mount once (App), as `useTaskArtifactSync` is.
 *
 * Sources, in order of authority:
 *  - the composer's in-memory turns (`useIngestComposerStore`): uploading, errored, duplicate;
 *  - `myDrops` (localStorage, per `sub`): the ids remembered across a reload, for drops no turn
 *    in this session covers.
 * A drop appears once: a turn that holds an ingest id hides the stored drop with that id.
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
  const reconcile = useCanvasStore((s) => s.reconcileIngestArtifacts);

  // `submit` records the drop BEFORE it patches the turn, so a change of `turns` is when the
  // stored list has changed too.
  const drops = useMemo(() => readMyDrops(owner), [owner, turns]);

  const ids = useMemo(() => {
    const out = new Set<string>();
    for (const t of turns) if (t.ingestId) out.add(t.ingestId);
    for (const d of drops) out.add(d.ingestId);
    return [...out];
  }, [turns, drops]);
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
      ...drops
        .filter((d) => !covered.has(d.ingestId))
        .map((d) => ({
          key: d.ingestId,
          filename: d.filename,
          kind: null,
          droppedAt: d.droppedAt,
          phase: "status" as const,
          ingestId: d.ingestId,
          error: null,
          acceptedThisSession: false,
          duplicate: null,
          note: null,
          row: rows[d.ingestId] ?? null,
          notFound: !!notFound[d.ingestId],
        })),
    ];
    reconcile(entries.map(ingestToArtifact), renamed);
  }, [turns, drops, rows, notFound, reconcile]);
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
