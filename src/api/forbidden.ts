/**
 * forbidden -- the 403 seam. `client.ts` REPORTS that a route answered 403; whoever owns the session LISTENS
 * (the entitlements sync refreshes the matrix, because a 403 is the signal that a grant changed). Deliberately
 * knows no store: `src/api/` imports nothing from `src/store/`.
 */
type Listener = (op: string) => void;

const listeners = new Set<Listener>();

/** Subscribe to every reported 403. Returns the unsubscribe. */
export function onForbidden(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** A route answered 403. `op` names it (`METHOD /path`). A throwing listener never reaches the transport. */
export function reportForbidden(op: string): void {
  for (const l of [...listeners]) {
    try {
      l(op);
    } catch (err) {
      console.warn("onForbidden listener threw:", err);
    }
  }
}
