/**
 * IngestDragOverlay — the window-wide drag surface. While a drag carrying `Files` is over the
 * window (and the ingest flag is on) the app is dimmed and "Drop to ingest" shows; a drop
 * anywhere that the composer did not itself take lands in the composer as a chip.
 *
 * dragenter/leave are counted in the CAPTURE phase: the composer stops propagation on its own
 * drag events (P0 guarantee), and counting in the bubble phase would then see leaves with no
 * matching enters. A leave with `relatedTarget === null` is the pointer exiting the window.
 * The overlay is `pointer-events-none`, so it never becomes the drag target (no flicker).
 * `text/plain` drags (canvas chips) are ignored entirely.
 */
import { useEffect, useState } from "react";
import { carriesFiles } from "@/lib/fileDropGuard";
import { isIngestUiEnabled } from "@/lib/ingestFlag";
import { useIngestComposerStore } from "@/store/useIngestComposerStore";

export function IngestDragOverlay() {
  const [active, setActive] = useState(false);
  const enabled = isIngestUiEnabled();

  useEffect(() => {
    if (!enabled) return;
    let depth = 0;
    const hide = () => {
      depth = 0;
      setActive(false);
    };
    const enter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth++;
      setActive(true);
    };
    const leave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0 || e.relatedTarget === null) hide();
    };
    // Capture: hides even when the composer stops the event.
    const dropCapture = () => hide();
    // Bubble: only reached by drops the composer did not take.
    const dropBubble = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) useIngestComposerStore.getState().attach(f);
    };
    const over = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    window.addEventListener("dragenter", enter, true);
    window.addEventListener("dragleave", leave, true);
    window.addEventListener("dragend", hide, true);
    window.addEventListener("drop", dropCapture, true);
    window.addEventListener("drop", dropBubble);
    window.addEventListener("dragover", over);
    return () => {
      window.removeEventListener("dragenter", enter, true);
      window.removeEventListener("dragleave", leave, true);
      window.removeEventListener("dragend", hide, true);
      window.removeEventListener("drop", dropCapture, true);
      window.removeEventListener("drop", dropBubble);
      window.removeEventListener("dragover", over);
    };
  }, [enabled]);

  if (!enabled || !active) return null;
  return (
    <div
      data-ingest-drag-overlay
      aria-hidden="true"
      className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-center justify-center pointer-events-none"
    >
      <p className="text-lg font-mono uppercase tracking-[0.3em] text-neon-cyan">Drop to ingest</p>
    </div>
  );
}
