/**
 * myDrops — the user's OWN drops, so a status card survives a closed panel and a reload.
 *
 * The status card is a turn result in the transcript, but the transcript is in-memory. To get a
 * card back after a reload the client must remember the ids; `GET /ingest/{id}/status` (caller-
 * scoped to submitted_by / on_behalf_of) then answers by id.
 *
 * THE PLATFORM HAS NO LIST ROUTE (measured: the only GET is `/ingest/{id}/status`), so this list
 * is client-side for now. A server list route is requested of Lane 1 — see
 * `sessions/2026-10-10-packet-to-lane-1-duplicate-mints-a-row-and-my-drops.md`. When it lands,
 * this module becomes a cache or goes away.
 *
 * Keyed by the authenticated user's stable id (the OIDC `sub` — the same identity
 * `reconcileSessionOwner` keys on): `cortex.myDrops.v1:<sub>`. No authenticated user means no
 * list: nothing is written, [] is read. Separate keys per user mean B can never read A's list, so
 * this key is deliberately NOT in `sessionIsolation`'s purge list — a purge would also delete the
 * SAME user's list on a re-login, which is exactly when it is wanted. (The in-memory part, the
 * panel's rendering, lives in components and derives from this module on each render.)
 *
 * Every storage access is wrapped: private mode / blocked storage degrades to "no list".
 */
export interface MyDrop {
  ingestId: string;
  filename: string;
  /** epoch ms */
  droppedAt: number;
}

export const MY_DROPS_CAP = 50;
const KEY_PREFIX = "cortex.myDrops.v1:";

export function myDropsKey(owner: string): string {
  return KEY_PREFIX + owner;
}

function isDrop(x: unknown): x is MyDrop {
  if (!x || typeof x !== "object") return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.ingestId === "string" && d.ingestId !== "" &&
    typeof d.filename === "string" &&
    typeof d.droppedAt === "number"
  );
}

/** Newest first. [] without an owner, without storage, or on a corrupt value. */
export function readMyDrops(owner: string | null | undefined): MyDrop[] {
  if (!owner) return [];
  try {
    const raw = window.localStorage.getItem(myDropsKey(owner));
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isDrop) : [];
  } catch {
    return [];
  }
}

/** Newest first, deduped by ingestId (the newest entry wins), capped at MY_DROPS_CAP. */
export function recordMyDrop(owner: string | null | undefined, drop: MyDrop): void {
  if (!owner) return;
  try {
    const rest = readMyDrops(owner).filter((d) => d.ingestId !== drop.ingestId);
    const next = [drop, ...rest].slice(0, MY_DROPS_CAP);
    window.localStorage.setItem(myDropsKey(owner), JSON.stringify(next));
  } catch {
    /* storage unavailable: the drop still renders in the transcript this session */
  }
}
