/**
 * acted -- the own-act seam. `client.ts` REPORTS that this viewer's `/act` was accepted; whoever owns the task
 * queue LISTENS (the queue sync re-reads it, because an act changes what is waiting for the viewer). Every act
 * path goes through `actOnHumanTask`, so this is one report for all of them. Deliberately knows no store:
 * `src/api/` imports nothing from `src/store/`.
 */
type Listener = (taskId: string) => void;

const listeners = new Set<Listener>();

/** Subscribe to every accepted act. Returns the unsubscribe. */
export function onActed(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The viewer's act on `taskId` was accepted. A throwing listener never reaches the caller. */
export function reportActed(taskId: string): void {
  for (const l of [...listeners]) {
    try {
      l(taskId);
    } catch (err) {
      console.warn("onActed listener threw:", err);
    }
  }
}
