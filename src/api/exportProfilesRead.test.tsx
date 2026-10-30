/**
 * The typed profiles read, through the REAL client and the real axios pipeline (adapter stubbed): a
 * stubbed adapter returning #154's body yields the two profiles; an element with `granularity: "answer"`
 * (#148's shape) passes VERBATIM, because granularity is config and not a cortex enum (architect 2026-10-30); a
 * body with an EMPTY granularity still yields a throw, and the picker shows its existing failure state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor, act } from "@testing-library/react";
import type { AxiosAdapter } from "axios";

const { reply, urls } = vi.hoisted(() => ({ reply: { data: [] as unknown }, urls: [] as string[] }));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const adapter: AxiosAdapter = async (config) => {
    urls.push(`${(config.method ?? "").toUpperCase()} ${config.url}`);
    return { data: reply.data, status: 200, statusText: "OK", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = adapter;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

import { fetchIngestExportProfiles } from "./client";
import { FIXTURE_154_PROFILES } from "@/lib/reviewExport";
import { ReviewExportControl } from "@/components/ApprovalTask/ReviewExportControl";
import { useIngestStatusStore } from "@/store/useIngestStatusStore";
import type { IngestStatusRow } from "@/lib/ingestWire";

const ID = "sha256:abc";
const INITIAL = useIngestStatusStore.getState();
const ANSWER = { name: "per-answer", format: "csv", granularity: "answer", label: "x" };
const BAD = [...FIXTURE_154_PROFILES, { ...ANSWER, granularity: "" }];

beforeEach(() => {
  urls.length = 0;
  window.localStorage.setItem("cortex.reviewExport", "1");
});
afterEach(() => {
  cleanup();
  useIngestStatusStore.setState(INITIAL, true);
  window.localStorage.clear();
});

describe("fetchIngestExportProfiles (typed read)", () => {
  it("#154's body yields the two profiles, in server order, from GET /ingest/export/profiles", async () => {
    reply.data = JSON.parse(JSON.stringify(FIXTURE_154_PROFILES));
    const out = await fetchIngestExportProfiles();
    expect(out).toEqual(FIXTURE_154_PROFILES);
    expect(urls).toEqual(["GET /ingest/export/profiles"]);
  });

  it("a granularity \"answer\" element passes verbatim, in server order", async () => {
    reply.data = JSON.parse(JSON.stringify([...FIXTURE_154_PROFILES, ANSWER]));
    expect(await fetchIngestExportProfiles()).toEqual([...FIXTURE_154_PROFILES, ANSWER]);
  });

  it("a body with an EMPTY granularity element is refused (null from the reader, a throw from the call)", async () => {
    reply.data = BAD;
    await expect(fetchIngestExportProfiles()).rejects.toThrow(/malformed \/ingest\/export\/profiles/);
  });

  it("the picker shows its existing failure state for that body", async () => {
    reply.data = BAD;
    act(() =>
      useIngestStatusStore.setState({ rows: { [ID]: { ingest_id: ID, stage: "promoted" } as unknown as IngestStatusRow }, track: vi.fn() }),
    );
    const { container } = render(<ReviewExportControl ingestId={ID} />);
    await waitFor(() => expect(container.querySelector("[data-review-export]")?.getAttribute("data-review-export")).toBe("failed"));
    expect(container.querySelector("[data-export-failed]")?.textContent).toContain("malformed /ingest/export/profiles");
    expect(container.querySelector("[data-export-profile]")).toBeNull();
  });
});
