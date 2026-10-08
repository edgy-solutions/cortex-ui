/**
 * The Friday walk as a dry run: drop -> kind -> review -> promote with a reason. Real app, real
 * src/api/client.ts fetches, a route table built from existing captures (see fridayRoutes.ts).
 */
import { test, expect, type Page } from "@playwright/test";
import { installFridayRoutes, seedFakeOidcSession, type Friday } from "./fridayRoutes";

const REASON_TYPED = "  PCN26-117 checked against the drawing register ";
const REASON_SENT = "PCN26-117 checked against the drawing register";

function ladderState(page: Page, stage: string) {
  return page.locator(`[data-ingest-ladder-stage="${stage}"]`).first();
}

/** Steps 1-8, shared by both walks. */
async function walkToAct(page: Page, f: Friday) {
  await seedFakeOidcSession(page, f.seed.droppedBy.authz_id);
  await page.goto("/");
  await page.locator("[data-ingest-trigger]").click();
  await page.locator("[data-ingest-file-input]").setInputFiles({
    name: "PCN26-117.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4 e2e stand-in\n"),
  });
  await page.locator('[data-ingest-kind="pdf"]').click();
  await page.locator("[data-ingest-kind-confirm]").click();

  const card = page.locator(`[data-ingest-id="${f.seed.ingestId}"]`);
  await expect(card).toBeVisible();
  // received -> extracting -> review at the 2000 ms poll
  await expect(ladderState(page, "review")).toHaveAttribute("data-ingest-ladder-state", "current", {
    timeout: 20_000,
  });

  // The approval card for the same task is on screen too, and its reason box has the a11y name.
  await expect(approvalCard(page)).toBeVisible();

  // The same accessible name is on BOTH the ingest status card and the ApprovalTaskCard (see
  // approvalCard()), so step 6 is scoped to the status card.
  await card.getByRole("textbox", { name: "Reason for decision" }).fill(REASON_TYPED);
  await page.locator('[data-ingest-verb="promoted"]').click();
  await expect.poll(() => f.actBodies.length, { message: "the act POST never reached the route table" }).toBe(1);
  expect(f.actBodies[0]).toEqual({ decision: "promoted", comment: REASON_SENT });
}

/**
 * The approval card: the document_promotion task is mirrored into a task-artifact from the
 * /me/human_tasks row (useTaskArtifactSync) and drawn by ApprovalTaskCard on its own, with no
 * stream component involved. Its reason box (data-reason-input) carries the same accessible name.
 */
function approvalCard(page: Page) {
  return page.getByRole("textbox", { name: "Reason for decision" }).and(page.locator("[data-reason-input]"));
}

function report(f: Friday) {
  test.info().annotations.push({ type: "unservedHit", description: JSON.stringify(f.unservedHit) });
}

test("walk A: drop, review, promote with a reason (hop 4b, the seven-field payload: HYPOTHETICAL)", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4b" });
  await walkToAct(page, f);

  await expect(page.locator("[data-ingest-status]")).toHaveText("promoted", { timeout: 20_000 });
  // jsdom test B3's ladder expectation, copied.
  const ladder = await page
    .locator("[data-ingest-ladder-stage]")
    .evaluateAll((els) =>
      Object.fromEntries(
        els.map((el) => [el.getAttribute("data-ingest-ladder-stage"), el.getAttribute("data-ingest-ladder-state")]),
      ),
    );
  expect(ladder).toEqual({ received: "done", extracting: "done", review: "done", promoted: "current" });

  report(f);
  expect(f.unrouted).toEqual([]);
});

test("walk B: what the live gateway does today refuses this promote (422 promotion_payload_invalid) until the 7 payload fields land", async ({ page }) => {
  const f = await installFridayRoutes(page, { act: "4a" });
  await walkToAct(page, f);

  await expect(page.locator('[data-ingest-act-refusal="promotion_payload_invalid"]')).toBeVisible();
  const refusalBody = f.fixture.hops.find((h) => h.id === "4a-act-refused-422")!.response.body as {
    message: string;
  };
  await expect(page.getByRole("alert")).toContainText(refusalBody.message);
  await expect(ladderState(page, "review")).toHaveAttribute("data-ingest-ladder-state", "current");

  report(f);
  expect(f.unrouted).toEqual([]);
});

// The label step. ProvenanceFloorLabel renders inside SemanticInterpreter for a component that
// carries provenance_floor, and a component reaches the browser only as an answer artifact over
// GET /electric/shape?table=answer_artifact_projection (or an interview stream). That shape is in
// KNOWN_UNSERVED: no wire capture exists, and hops 6a/6b are component BODIES, not envelopes.
// Replaying them needs an answer_artifact_projection row shape no capture carries.
test.fixme("walk A label: provenance_floor unverified before promote, user-drop after", async () => {
  // Would assert, with hop 6a: [data-provenance-floor-unverified] +
  // [data-provenance-floor-ingest-id="<id>"]; with hop 6b: no unverified and
  // [data-provenance-floor="user-drop"]. Blocked on: no capture of /electric/shape
  // answer_artifact_projection.
});
