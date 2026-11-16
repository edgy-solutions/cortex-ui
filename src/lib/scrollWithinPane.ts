/**
 * Scroll `el` into view by moving ONE scrollable pane per axis, never an ancestor beyond it.
 *
 * `Element.scrollIntoView` scrolls every scrollable ancestor, including `overflow:hidden` boxes the viewer
 * can never scroll back. On 2026-11-16 a grouped-review card selected row 0 on mount while the stage camera
 * was still travelling; the row sat past the stage edge, the browser scrolled the stage root and its
 * `[data-stage-scroll]` scroller (scrollTop 98..7576) and the card was left off-centre or off-screen.
 * PdfEvidencePane states the same rule: "scroll THIS pane only".
 *
 * Candidates are the ancestors of `el`; inside a `[data-stage-card]` only those strictly below the card
 * (a card scrolls its own panes, never the stage). Only `auto`/`scroll` boxes that overflow are written.
 */
export type PaneAlign = "nearest" | "center";

const scrollable = (v: string) => v === "auto" || v === "scroll";

function scaleOf(rect: number, offset: number): number {
  const s = offset > 0 ? rect / offset : 1;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

function delta(
  align: PaneAlign,
  eStart: number,
  eEnd: number,
  start: number,
  size: number,
): number {
  const end = start + size;
  if (align === "center") return (eStart + eEnd) / 2 - (start + size / 2);
  if (eStart < start) return eStart - start;
  if (eEnd > end) return Math.min(eEnd - end, eStart - start);
  return 0;
}

export function scrollWithinPane(
  el: Element | null | undefined,
  opts: { block?: PaneAlign; inline?: PaneAlign } = {},
): void {
  if (!el) return;
  const block = opts.block ?? "nearest";
  const inline = opts.inline ?? "nearest";
  const card = el.closest("[data-stage-card]");
  const candidates: HTMLElement[] = [];
  for (let p = el.parentElement; p; p = p.parentElement) {
    if (p === card || p === document.body || p === document.documentElement) break;
    candidates.push(p);
  }
  if (typeof getComputedStyle !== "function") return;
  const yPane = candidates.find((p) => {
    const cs = getComputedStyle(p);
    return scrollable(cs.overflowY) && p.scrollHeight > p.clientHeight;
  });
  const xPane = candidates.find((p) => {
    const cs = getComputedStyle(p);
    return scrollable(cs.overflowX) && p.scrollWidth > p.clientWidth;
  });
  const er = el.getBoundingClientRect();
  if (yPane) {
    const pr = yPane.getBoundingClientRect();
    const sy = scaleOf(pr.height, yPane.offsetHeight);
    const top = pr.top + yPane.clientTop * sy;
    const d = delta(block, er.top, er.bottom, top, yPane.clientHeight * sy);
    if (d !== 0) yPane.scrollTop += d / sy;
  }
  if (xPane) {
    const pr = xPane.getBoundingClientRect();
    const sx = scaleOf(pr.width, xPane.offsetWidth);
    const left = pr.left + xPane.clientLeft * sx;
    const d = delta(inline, er.left, er.right, left, xPane.clientWidth * sx);
    if (d !== 0) xPane.scrollLeft += d / sx;
  }
}
