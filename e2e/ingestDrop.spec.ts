/**
 * P0 2026-10-08 (architect, sandbox rev 182, cortex 83366dd5): in the INGEST A DOCUMENT slide-in,
 * (a) a dropped file made the browser navigate to it, and (b) clicking the pill opened nothing.
 *
 * friday.spec.ts never saw either: it calls `setInputFiles` on the hidden input, which bypasses
 * both the click and the drop. These walks go through the POINTER instead — they aim at the
 * pill's centre the way a person does, so anything stacked above the zone takes the hit here too.
 *
 * "No navigation" for a synthetic drop is `defaultPrevented`: a drop whose default is not
 * cancelled is exactly the one a real browser turns into a navigation to the file.
 */
import { test, expect, type Page } from "@playwright/test";
import { installFridayRoutes, seedFakeOidcSession, type Friday } from "./fridayRoutes";

async function openSlideIn(page: Page, f: Friday) {
  await seedFakeOidcSession(page, f.seed.droppedBy.authz_id);
  await page.goto("/");
  await page.locator("[data-ingest-trigger]").click();
  const zone = page.locator("[data-ingest-drop]");
  await expect(zone).toBeVisible();
  // The slide-in springs in from x:100% — aim only once the box has stopped moving.
  let last = "";
  await expect
    .poll(async () => {
      const b = JSON.stringify(await zone.boundingBox());
      const settled = b === last;
      last = b;
      return settled;
    }, { intervals: [150] })
    .toBe(true);
  const box = (await zone.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

/** What a person's pointer lands on at (x, y): the top element and whether it is in the zone. */
async function hitAt(page: Page, x: number, y: number) {
  return page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    const desc = el
      ? `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.getAttribute("class") ?? "")
          .split(/\s+/)
          .slice(0, 6)
          .join(".")} [${Array.from(el.attributes)
          .filter((a) => a.name.startsWith("data-"))
          .map((a) => a.name)
          .join(",")}]`
      : "null";
    return { desc, inZone: !!el?.closest("[data-ingest-drop]") };
  }, { x, y });
}

/** Dispatch dragenter/dragover/drop carrying a real File at the element under (x, y). */
async function dropAt(page: Page, x: number, y: number, name = "PCN26-117.pdf") {
  return page.evaluate(({ x, y, name }) => {
    const target = document.elementFromPoint(x, y)!;
    const dt = new DataTransfer();
    dt.items.add(new File(["%PDF-1.4 e2e stand-in\n"], name, { type: "application/pdf" }));
    const fire = (type: string) => {
      const ev = new DragEvent(type, { bubbles: true, cancelable: true, composed: true, dataTransfer: dt, clientX: x, clientY: y });
      target.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    return { dragover: (fire("dragenter"), fire("dragover")), drop: fire("drop") };
  }, { x, y, name });
}

test("the pill is what the pointer hits at its own centre", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  const c = await openSlideIn(page, f);
  const hit = await hitAt(page, c.x, c.y);
  expect(hit.inZone, `the pointer lands on ${hit.desc}, not the drop zone`).toBe(true);
});

test("clicking the pill opens the file chooser", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  const c = await openSlideIn(page, f);
  const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
  await page.mouse.click(c.x, c.y);
  const fc = await chooser;
  expect(fc.isMultiple()).toBe(false);
  await fc.setFiles({ name: "PCN26-117.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
  await expect(page.locator('[data-ingest-kind="pdf"]')).toBeVisible();
});

test("a drop on the pill is cancelled (no navigation) and reaches POST /ingest", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  const c = await openSlideIn(page, f);
  const urlBefore = page.url();
  const posted = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/ingest");

  expect(await dropAt(page, c.x, c.y)).toEqual({ dragover: true, drop: true });
  await page.locator('[data-ingest-kind="pdf"]').click();
  await page.locator("[data-ingest-kind-confirm]").click();
  const req = await posted;
  // The body is MULTIPART with the file in it: axios once JSON-stringified this FormData and the
  // File went out as `{}` (see `uploadIngest` in src/api/client.ts).
  expect(req.headers()["content-type"] ?? "").toMatch(/^multipart\/form-data; boundary=/);
  expect(req.postDataBuffer()?.toString("latin1")).toContain('filename="PCN26-117.pdf"');
  await expect(page.locator(`[data-ingest-id="${f.seed.ingestId}"]`)).toBeVisible();
  // "received" is a moment, not a resting state: the fixture's polls go on to extracting and
  // review within seconds. So the claim is the rung (current, or done and passed), not the badge.
  await expect(page.locator('[data-ingest-ladder] [data-ingest-ladder-stage="received"]')).toHaveAttribute(
    "data-ingest-ladder-state",
    /^(current|done)$/,
  );
  // The screenshot the P0 asks for: a pointer-aimed drop that has reached "received".
  await page.screenshot({ path: "test-results/ingest-drop-received.png" });
  expect(page.url()).toBe(urlBefore);
});

test("a drop that MISSES the pill is still cancelled — the tab never navigates", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await openSlideIn(page, f);
  const header = (await page.locator("[data-ingest-slide-in] .sticky").boundingBox())!;
  const misses = [
    { where: "slide-in header", x: header.x + 40, y: header.y + header.height / 2 },
    { where: "backdrop", x: 20, y: 300 },
  ];
  for (const m of misses) {
    expect(await dropAt(page, m.x, m.y, "stray.pdf"), m.where).toEqual({ dragover: true, drop: true });
  }
});

test("FULL SCREEN: the slide-in survives the pointer leaving the window, and a drop still lands", async ({ page }) => {
  // The likeliest reading of rev 182: in full screen the right rail is hover-only and the slide-in
  // lives inside it. Fetching a file from Explorer takes the pointer out of the window; the rail
  // collapsed, the zone unmounted, and the returning drop had nothing to land on.
  const f = await installFridayRoutes(page, { act: "4b" });
  await seedFakeOidcSession(page, f.seed.droppedBy.authz_id);
  await page.goto("/");
  await page.locator("[data-mode-toggle]").click();
  const vp = page.viewportSize()!;
  await page.mouse.move(vp.width - 8, vp.height / 2); // hover the right rail strip open
  await page.locator("[data-ingest-trigger]").click();
  const zone = page.locator("[data-ingest-drop]");
  await expect(zone).toBeVisible();
  // What a browser fires when the pointer leaves the window: mouseout with no relatedTarget.
  await page.evaluate(() =>
    document.querySelector("[data-ingest-drop]")!.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: null })),
  );
  await page.waitForTimeout(600); // the rail's exit animation, had it collapsed
  await expect(zone, "the slide-in unmounted when the pointer left the window").toHaveCount(1);

  const box = (await zone.boundingBox())!;
  const posted = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/ingest");
  expect(await dropAt(page, box.x + box.width / 2, box.y + box.height / 2)).toEqual({ dragover: true, drop: true });
  await page.locator('[data-ingest-kind="pdf"]').click();
  await page.locator("[data-ingest-kind-confirm]").click();
  expect((await posted).postDataBuffer()?.toString("latin1")).toContain('filename="PCN26-117.pdf"');
});
