/**
 * pdfSource — the ONE module that touches pdf.js, so the review card can be tested against a
 * stand-in and the main bundle never carries the library: `openPdf` imports `pdfjs-dist` (and its
 * worker's URL) on first call, and Vite splits both into their own chunks.
 *
 * NO NETWORK HERE. pdf.js is handed bytes (`getDocument({ data })`) that were fetched through the
 * minting wrapper (`fetchIngestSource` in `src/api/client.ts`); it is never given a URL, so it
 * never makes a request of its own with or without the caller's bearer.
 *
 * The source is a document someone dropped, so it is untrusted input. pdf.js's font path is the
 * one that compiled code from PDF data before (CVE-2024-4367, fixed in 4.2.67); 6.x removed that
 * eval path and its `isEvalSupported` switch outright, so there is nothing left to turn off.
 */

export interface RenderedPage {
  /** CSS pixels, the size the outline is scaled to (`scaleBox`'s `rendered`). */
  width: number;
  height: number;
}

export interface PdfDoc {
  numPages: number;
  /** Draws page `n` (1-based) into `canvas` at `cssWidth` CSS pixels wide, sharp at the device's ratio. */
  renderPage(n: number, canvas: HTMLCanvasElement, cssWidth: number): Promise<RenderedPage>;
  destroy(): void;
}

/** A render superseded by a newer one: not a failure, nothing to show. */
export class RenderCancelled extends Error {}

export async function openPdf(bytes: ArrayBuffer): Promise<PdfDoc> {
  const [pdfjs, worker] = await Promise.all([
    import("pdfjs-dist"),
    import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const loading = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const doc = await loading.promise;
  const inFlight = new WeakMap<HTMLCanvasElement, { cancel(): void }>();

  return {
    numPages: doc.numPages,
    async renderPage(n, canvas, cssWidth) {
      inFlight.get(canvas)?.cancel();
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const scale = cssWidth / base.width;
      const ratio = typeof window !== "undefined" && window.devicePixelRatio > 0 ? window.devicePixelRatio : 1;
      const viewport = page.getViewport({ scale: scale * ratio });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const css = { width: cssWidth, height: base.height * scale };
      canvas.style.width = `${css.width}px`;
      canvas.style.height = `${css.height}px`;
      const task = page.render({ canvas, viewport });
      inFlight.set(canvas, task);
      try {
        await task.promise;
      } catch (e) {
        if (e instanceof pdfjs.RenderingCancelledException) throw new RenderCancelled();
        throw e;
      } finally {
        if (inFlight.get(canvas) === task) inFlight.delete(canvas);
      }
      return css;
    },
    destroy() {
      void loading.destroy();
    },
  };
}
