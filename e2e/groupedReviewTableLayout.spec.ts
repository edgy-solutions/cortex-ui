/**
 * Real-layout proof for the disposition-review parts table (OV-19-05, 17 parts). jsdom cannot measure
 * layout, so this runs in Chromium. It is a BY-HAND proof (`npx playwright test -c playwright.config.ts
 * e2e/groupedReviewTableLayout.spec.ts`): CI does not run Playwright. The CI tripwire is
 * GroupedReviewTable.layout.test.tsx, which only checks the class names that make this pass.
 *
 * The bug: the body was `md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]`, so the table got 5/12 of the card, narrower
 * than its four columns. It scrolled sideways inside its track with the scrollbar under all 17 rows, so to the
 * reader Disposition, Replacement / LTB and the SET DISPOSITION buttons were cut off at the source pane edge.
 * `md:` also keyed on the viewport, while this card sits inside a canvas card.
 *
 * Widths are the CARD width (the harness wrapper): 1540 and 1030 sit above the 64rem (1024px) side-by-side
 * threshold; 800 stacks.
 */
import { test, expect } from "@playwright/test";

for (const w of [1540, 1030, 800]) {
  test(`parts table is not clipped at card width ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: 1700, height: 1200 });
    await page.goto(`/e2e/harness/groupedReviewTable.html?w=${w}`);
    await expect(page.getByRole("button", { name: /set disposition/i })).toHaveCount(17);

    const m = await page.evaluate(() => {
      const th = [...document.querySelectorAll("th")].find((t) => /replacement\s*\/\s*ltb/i.test(t.textContent ?? ""))!;
      const scroller = th.closest("div.overflow-x-auto") as HTMLElement;
      const sr = scroller.getBoundingClientRect();
      const thr = th.getBoundingClientRect();
      const btnRights = [...document.querySelectorAll("button")]
        .filter((b) => /set disposition/i.test(b.textContent ?? ""))
        .map((b) => b.getBoundingClientRect().right);
      return {
        visibleLeft: sr.left,
        visibleRight: sr.left + scroller.clientWidth,
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
        thLeft: thr.left,
        thRight: thr.right,
        maxBtnRight: Math.max(...btnRights),
        n: btnRights.length,
      };
    });

    expect(m.n).toBe(17);
    expect(m.maxBtnRight, `a Set disposition button ends at ${m.maxBtnRight}, past the scroller visible edge ${m.visibleRight}`).toBeLessThanOrEqual(m.visibleRight + 1);
    expect(m.scrollWidth, `the table scrolls sideways: scrollWidth ${m.scrollWidth} > clientWidth ${m.clientWidth}`).toBeLessThanOrEqual(m.clientWidth + 1);
    expect(m.thLeft).toBeGreaterThanOrEqual(m.visibleLeft - 1);
    expect(m.thRight, `Replacement / LTB header ends at ${m.thRight}, past the visible edge ${m.visibleRight}`).toBeLessThanOrEqual(m.visibleRight + 1);
  });
}
