/**
 * Architect ruling 2026-10-09, "the drop is the prompt" — the composer is the drop target.
 * (Supersedes the P0 2026-10-08 walks against the HUD slide-in pill, which is gone.)
 *
 * friday.spec.ts uses `setInputFiles` on the hidden input, which bypasses both the click and the
 * drop. These walks go through the POINTER's drop: they dispatch the drag events at the element
 * under the pointer, as a person's drop does.
 *
 * "No navigation" for a synthetic drop is `defaultPrevented`: a drop whose default is not
 * cancelled is exactly the one a real browser turns into a navigation to the file.
 */
import { test, expect, type Page } from "@playwright/test";
import { installFridayRoutes, seedFakeOidcSession, type Friday } from "./fridayRoutes";

async function open(page: Page, f: Friday) {
  await seedFakeOidcSession(page, f.seed.droppedBy.authz_id);
  await page.goto("/");
  const composer = page.locator("[data-ingest-composer]");
  await expect(composer).toBeVisible();
  // The composer fades/slides in; aim only once its box has stopped moving.
  let last = "";
  await expect
    .poll(async () => {
      const b = JSON.stringify(await composer.boundingBox());
      const settled = b === last;
      last = b;
      return settled;
    }, { intervals: [150] })
    .toBe(true);
  const box = (await composer.boundingBox())!;
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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

test("the paperclip opens the file chooser", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await open(page, f);
  const chooser = page.waitForEvent("filechooser", { timeout: 5_000 });
  await page.getByRole("button", { name: "Attach a document" }).click();
  const fc = await chooser;
  expect(fc.isMultiple()).toBe(false);
  await fc.setFiles({ name: "PCN26-117.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n") });
  await expect(page.locator("[data-ingest-chip-name]")).toHaveText("PCN26-117.pdf");
});

test("a drop on the composer is cancelled (no navigation), lands a chip, and Send reaches POST /ingest", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  const c = await open(page, f);
  const urlBefore = page.url();
  const posted = page.waitForRequest((r) => r.method() === "POST" && new URL(r.url()).pathname === "/ingest");

  expect(await dropAt(page, c.x, c.y)).toEqual({ dragover: true, drop: true });
  await expect(page.locator("[data-ingest-chip-name]")).toHaveText("PCN26-117.pdf");
  const send = page.getByRole("button", { name: "Send" });
  // The kind is read off the file (.pdf + %PDF-): no picker, Send is live at once.
  await expect(page.locator('[data-ingest-kind-inferred="pdf"]')).toBeVisible();
  await expect(page.locator("[data-ingest-kind]")).toHaveCount(0);
  await expect(send).toBeEnabled();
  await send.click();
  const req = await posted;
  // The body is MULTIPART with the file in it: axios once JSON-stringified this FormData and the
  // File went out as `{}` (see `uploadIngest` in src/api/client.ts).
  expect(req.headers()["content-type"] ?? "").toMatch(/^multipart\/form-data; boundary=/);
  expect(req.postDataBuffer()?.toString("latin1")).toContain('filename="PCN26-117.pdf"');
  // P0 2026-10-12: a dropped .pdf posts content_kind=pdf (absent, doc-tools HALTs the drop).
  expect(req.postDataBuffer()?.toString("latin1")).toMatch(/name="content_kind"\r\n\r\npdf\r\n/);
  // The drop is a TURN on the answers rail; the turn opens to the status card.
  const entry = page.locator("[data-virtual-item]").filter({ has: page.locator("[data-ingest-stage]") });
  await expect(entry).toHaveCount(1);
  await expect(entry).toContainText("PCN26-117.pdf");
  // The in-flight badge on the paperclip filters the rail to drops (it does not open the picker).
  await page.locator("[data-ingest-inflight-badge]").click();
  await expect(page.locator("[data-type-filter=\"INGEST\"]")).toBeVisible();
  await page.locator("[data-type-filter=\"INGEST\"]").click();
  await expect(page.locator("[data-type-filter]")).toHaveCount(0);
  await entry.click();
  await expect(page.locator(`[data-ingest-id="${f.seed.ingestId}"]`)).toBeVisible();
  expect(page.url()).toBe(urlBefore);
});

test("a drop that MISSES the composer is still cancelled and still lands the chip", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await open(page, f);
  const urlBefore = page.url();
  // Somewhere that is not the composer: the top-left corner of the app.
  expect(await dropAt(page, 4, 4, "stray.pdf")).toEqual({ dragover: true, drop: true });
  await expect(page.locator("[data-ingest-chip-name]")).toHaveText("stray.pdf");
  expect(page.url()).toBe(urlBefore);
});

test("dragenter anywhere shows the overlay; the drop hides it", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await open(page, f);
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "a.pdf", { type: "application/pdf" }));
    document.body.dispatchEvent(new DragEvent("dragenter", { bubbles: true, cancelable: true, dataTransfer: dt }));
  });
  await expect(page.locator("[data-ingest-drag-overlay]")).toBeVisible();
  await dropAt(page, 4, 4);
  await expect(page.locator("[data-ingest-drag-overlay]")).toHaveCount(0);
});

test("the grown composer returns to rest when the drag just stops (cannot stick)", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await open(page, f);
  const composer = page.locator("[data-ingest-composer]");
  const rest = (await composer.boundingBox())!.height;
  const dataTransfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer();
    dt.items.add(new File(["x"], "a.pdf", { type: "application/pdf" }));
    return dt;
  });
  await composer.dispatchEvent("dragenter", { dataTransfer });
  await composer.dispatchEvent("dragover", { dataTransfer });
  await expect(composer).toHaveAttribute("data-drag-active", "true");
  await expect.poll(async () => (await composer.boundingBox())!.height).toBeGreaterThan(rest);
  // No further events: no dragleave, no drop, no dragover.
  await page.waitForTimeout(600);
  await expect(composer).toHaveAttribute("data-drag-active", "false");
  await expect.poll(async () => (await composer.boundingBox())!.height).toBeCloseTo(rest, 0);
});
