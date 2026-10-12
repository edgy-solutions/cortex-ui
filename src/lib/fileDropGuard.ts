/**
 * useFileDropGuard — a FILE dragged onto any part of the app that does not take it must never
 * navigate the tab. A browser's default for an uncancelled drop of a file is to open it, which
 * throws away the session (P0 2026-10-08, sandbox rev 182: a drop that missed the ingest pill
 * navigated to the file).
 *
 * Window-level, bubble phase: a zone that does take the file cancels and stops the event itself,
 * so this only ever sees the misses. Keyed on the drag carrying `Files`, so the canvas's own chip
 * drags (`text/plain` ids) are left exactly as they were.
 */
import { useEffect } from "react";

/**
 * A drag over an element fires `dragover` on it every ~50 ms, even with a still pointer. So a
 * drag surface that has seen no dragover for this long is not being dragged over, whichever
 * dragleave went missing (swallowed by stopPropagation, Esc, a browser that leaves relatedTarget
 * empty, the grow transition moving the edge under a still pointer). Surfaces use it as a
 * watchdog so "stuck open" is impossible by construction.
 */
export const DRAG_IDLE_MS = 250;

export function carriesFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes("Files");
}

export function installFileDropGuard(target: Window = window): () => void {
  const cancel = (e: DragEvent) => {
    if (carriesFiles(e)) e.preventDefault();
  };
  target.addEventListener("dragover", cancel);
  target.addEventListener("drop", cancel);
  return () => {
    target.removeEventListener("dragover", cancel);
    target.removeEventListener("drop", cancel);
  };
}

export function useFileDropGuard(): void {
  useEffect(() => installFileDropGuard(), []);
}
