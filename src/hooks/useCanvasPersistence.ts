import { useEffect, useRef } from "react";
import { useStageStore, type CustomCanvas } from "@/store/useStageStore";
import { fetchCanvases, saveCanvases, saveCanvasesUrgently } from "@/api/client";

/**
 * useCanvasPersistence — sync the custom canvases with the server (ADR-0028),
 * so a user's boards are durable + cross-device. localStorage (the store's
 * persist) is the offline cache; the SERVER is the source of truth.
 *
 * On mount: load the server set. Server wins if it has data; otherwise migrate
 * any pre-persistence local set up to the server. Then debounced-save whenever
 * the canvases change. Best-effort throughout — if persistence is unconfigured
 * or offline, the local copy just keeps working.
 *
 * Call inside the AUTHED tree (the API needs the session).
 */
export function useCanvasPersistence() {
  const hydrated = useRef(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSaved = useRef<CustomCanvas[] | null>(null);
  /** The change the debounce has not sent yet — what a flush has to rescue. */
  const pending = useRef<CustomCanvas[] | null>(null);

  // Load from server once on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const server = (await fetchCanvases()) as CustomCanvas[];
        if (cancelled) return;
        const local = useStageStore.getState().canvases;
        if (server.length) {
          useStageStore.getState().setCanvases(server);
          lastSaved.current = server;
        } else if (local.length) {
          await saveCanvases(local);
          lastSaved.current = local;
        }
      } catch {
        /* offline / unconfigured → keep the local copy */
      } finally {
        hydrated.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Debounced save whenever the canvases change (after hydration).
  useEffect(() => {
    return useStageStore.subscribe((state) => {
      if (!hydrated.current) return;
      const canvases = state.canvases;
      if (canvases === lastSaved.current) return; // reference compare (immutable updates)
      lastSaved.current = canvases;
      pending.current = canvases;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        pending.current = null;
        saveCanvases(canvases).catch(() => {
          /* transient — the next change retries */
        });
      }, 800);
    });
  }, []);

  /**
   * FLUSH BEFORE THE PAGE GOES AWAY — the other half of why deleted boards came back.
   *
   * The 800ms debounce is right for dragging a card: a save per pointer-move would be a request
   * storm. It is wrong for the LAST change before a reload, and that is precisely the change a
   * person makes deliberately — delete the boards, then refresh to check they are gone. Inside
   * the debounce window the delete was never sent, the server still held them, and it handed
   * them back. THE RELOAD PERFORMED TO VERIFY THE DELETION WAS WHAT UNDID IT.
   *
   * `pagehide` rather than `beforeunload`: it fires for the back/forward cache and for mobile
   * tab discard, where `beforeunload` does not. `visibilitychange` catches a tab being
   * backgrounded, which is where a long-lived session actually loses a change.
   */
  useEffect(() => {
    const flush = () => {
      const canvases = pending.current;
      if (!canvases) return;
      pending.current = null;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Keepalive, because a normal request is cancelled when the document unloads — see
      // `saveCanvasesUrgently`. Without it this would look implemented and save nothing.
      void saveCanvasesUrgently(canvases);
    };
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHidden);
    };
  }, []);
}

/** Invisible mount point for the sync — place inside the authed tree. */
export function CanvasPersistence() {
  useCanvasPersistence();
  return null;
}
