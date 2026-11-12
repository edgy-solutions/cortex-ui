/**
 * THE DEMO ARM. With `reviewExport` and `reviewExportMock` on, the REAL mock ingest (`ingestMock.ts`) is driven to the
 * stage at which it seeds the review task, and the review button must show, offering exactly the fixture profiles that
 * list that stage. The stage is READ from the mock's own status row, never spelled here: the fixture mirrors the
 * producer's rows (`reviewExportMockProfiles.producerSeal.test.ts`), so a stage the mock reaches that no fixture profile
 * lists would hide the button in the demo, and this arm reds.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { ReviewExportAs } from "./ReviewExportAs";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import { FIXTURE_PROFILES } from "@/lib/reviewExport";
import { uploadIngest, fetchIngestStatus, __resetIngestMock } from "@/lib/ingestMock";
import type { IngestStatusRow } from "@/lib/ingestWire";

const INITIAL = useIngestStatusStore.getState();

beforeEach(() => {
  window.localStorage.setItem("cortex.reviewExport", "1");
  window.localStorage.setItem("cortex.reviewExportMock", "1");
});
afterEach(() => {
  cleanup();
  __resetIngestMock();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
});

/** Upload to the mock, then read its status until the stage stops changing. Returns the last row, verbatim. */
async function driveToRest(): Promise<Record<string, unknown>> {
  const up = (await uploadIngest(new File(["a"], "notice.pdf"), "pdf", "a@example.com", "pcn")) as { ingest_id: string };
  let row = (await fetchIngestStatus(up.ingest_id)) as Record<string, unknown>;
  for (let i = 0; i < 20; i++) {
    const next = (await fetchIngestStatus(up.ingest_id)) as Record<string, unknown>;
    if (next.stage === row.stage) return next;
    row = next;
  }
  throw new Error("the mock ingest never came to rest");
}

describe("ReviewExportAs on the mock demo", () => {
  it("shows the review button for the stage the mock reaches, offering the fixture profiles that list it", async () => {
    const row = await driveToRest();
    const id = row.ingest_id as string;
    const stage = row.stage as string;
    act(() => useIngestStatusStore.setState({ rows: { [id]: row as unknown as IngestStatusRow }, track: () => {} }));

    const want = FIXTURE_PROFILES.filter((p) => p.exportable_states?.includes(stage)).map((p) => p.name);
    expect(want.length, "some fixture profile lists the mock's stage").toBeGreaterThan(0);
    expect(want.length, "and not every one does: the filter is working").toBeLessThan(FIXTURE_PROFILES.length);

    const { container } = render(<ReviewExportAs ingestId={id} />);
    await waitFor(() => expect(container.querySelector("[data-review-export-as]")).not.toBeNull());
    fireEvent.click(container.querySelector("[data-review-export-as]")!);
    await waitFor(() => expect(container.querySelector("[data-export-profile]")).not.toBeNull());
    const offered = [...container.querySelectorAll("[data-export-profile]")].map((e) => e.getAttribute("data-export-profile"));
    expect(offered).toEqual(want);
  });
});
