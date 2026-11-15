import { useEffect } from "react";
import { useAuth } from "react-oidc-context";
import { onActed } from "@/api/acted";
import { createQueueRefresher, QUEUE_REFRESH_MS } from "@/lib/humanTaskQueue";

/**
 * Keep the task queue fresh. With a token: read the queue and the counts at mount, every `QUEUE_REFRESH_MS`,
 * after the viewer's own successful act, and when the tab turns visible after more than `QUEUE_REFRESH_MS`
 * since the last read began. Everything is cleared on unmount, on token loss and on a token change (a new
 * token is a new refresher). The Tasks badge and the canvas task-citizens read the store; none of them fetch.
 */
export function useHumanTaskSync() {
  const auth = useAuth();
  const token = auth.user?.access_token ?? null;
  useEffect(() => {
    if (!token) return;
    const queue = createQueueRefresher();
    void queue.refresh();
    const timer = setInterval(() => void queue.refresh(), QUEUE_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - queue.lastStartedAt() > QUEUE_REFRESH_MS) void queue.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    // Forced: an act changes what is waiting, so the read must start AFTER it, never join an earlier one.
    const offActed = onActed(() => void queue.refresh({ force: true }));
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      offActed();
      queue.dispose();
    };
  }, [token]);
}
