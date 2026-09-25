/**
 * THE BROWSER HALF OF THE CARD EXPORT — the only part that touches the DOM.
 *
 * `cardExport.ts` is pure and is where the seals live. Everything here reads the live document or
 * writes a file, which is untestable in a way that matters: a jsdom test of
 * `collectDocumentCss` would measure jsdom's stylesheet support, not the browser's. So this file
 * is kept DELIBERATELY THIN and every function has exactly one job, returns null rather than
 * throwing, and hands its result to the pure builder to be rendered.
 *
 * THE NULL RETURNS ARE THE POINT. A stylesheet that cannot be read and a card that cannot be
 * found both produce a file that says so — see `cardSection` in the builder. An export that threw
 * here would leave the user with no file and no reason; one that silently produced an empty frame
 * would be worse, because they would keep it.
 */

/**
 * The page's CSS as text, or null if none could be read.
 *
 * CROSS-ORIGIN SHEETS THROW ON `.cssRules` and there is no way to ask first — the access itself
 * is the test — so each sheet is attempted separately and a failure skips that sheet rather than
 * the export. In dev, Vite injects styles as inline `<style>` elements, which are same-origin and
 * read fine; in the container the built stylesheet is served from our own origin, so it reads too.
 * A future CDN-hosted sheet would silently drop out here, which is why the builder renders "the
 * page stylesheet could not be read" rather than assuming success.
 */
export function collectDocumentCss(doc: Document = document): string | null {
  const parts: string[] = [];
  for (const sheet of Array.from(doc.styleSheets)) {
    try {
      const rules = sheet.cssRules;
      if (!rules) continue;
      for (const rule of Array.from(rules)) parts.push(rule.cssText);
    } catch {
      // Unreadable sheet (cross-origin). Skipped, not fatal, and its absence is reported by the
      // builder rather than swallowed here.
      continue;
    }
  }
  const css = parts.join("\n").trim();
  return css === "" ? null : css;
}

/**
 * The card's markup, verbatim, or null.
 *
 * `outerHTML` and not a re-render: the point of section 1 is the card AS RENDERED, which includes
 * whatever the live component actually decided — the absence attributes it emitted, the rows it
 * chose to show, the tier it settled on. A second render could disagree with what the user is
 * looking at, and then the export would be a picture of a different card.
 */
export function captureCardHtml(node: Element | null | undefined): string | null {
  if (!node) return null;
  const html = node.outerHTML;
  return html && html.trim() !== "" ? html : null;
}

/**
 * Hand the file to the browser.
 *
 * A Blob and an object URL, revoked on the next frame. Not a `data:` URL — a full card export with
 * the page stylesheet inlined runs to hundreds of kilobytes and `data:` URLs hit length limits in
 * some browsers at exactly the sizes this produces, which would fail on the big exports and work
 * on the small ones.
 *
 * NO NETWORK IS TOUCHED, which is why this file declares no transport: the guard in
 * `scripts/check-transport-declarations.mjs` watches `fetch`/SSE sites, and a Blob download is
 * neither. If this ever gains a server round-trip it must be declared there first.
 */
export function downloadHtmlFile(filename: string, html: string, doc: Document = document): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  doc.body.appendChild(a);
  a.click();
  doc.body.removeChild(a);
  // Revoked async: revoking synchronously after `click()` races the download in some browsers and
  // produces a zero-byte file.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
