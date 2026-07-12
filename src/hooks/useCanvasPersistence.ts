import { useEffect, useRef } from "react";
import { useStageStore, type CustomCanvas } from "@/store/useStageStore";
import { fetchCanvases, saveCanvases } from "@/api/client";

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
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        saveCanvases(canvases).catch(() => {
          /* transient — the next change retries */
        });
      }, 800);
    });
  }, []);
}

/** Invisible mount point for the sync — place inside the authed tree. */
export function CanvasPersistence() {
  useCanvasPersistence();
  return null;
}
