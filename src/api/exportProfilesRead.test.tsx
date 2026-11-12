/**
 * The typed profiles read, through the REAL client and the real axios pipeline (adapter stubbed): a
 * stubbed adapter returning #154's body yields the two profiles; an element with `granularity: "answer"`
 * (#148's shape) passes VERBATIM, because granularity is config and not a cortex enum (architect 2026-10-30); a
 * body with an EMPTY granularity still yields a throw, and the export dialog shows its existing failure state.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
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
import { ExportSelectionDialog } from "@/components/ingest/ExportSelectionDialog";

const ID = "sha256:abc";
// SYNTHETIC state: the dialog offers a profile only when it lists the target's state.
const SA = "synthetic-state-a";
const withState = <T extends object>(ps: T[]) => ps.map((p) => ({ ...p, exportable_states: [SA] }));
const dialog = () => (
  <ExportSelectionDialog targets={[{ ingestId: ID, kind: null, state: SA }]} notReady={[]} others={0} source={ID} onClose={() => {}} />
);
const ANSWER = { name: "per-answer", format: "csv", granularity: "answer", label: "x" };
const BAD = [...FIXTURE_154_PROFILES, { ...ANSWER, granularity: "" }];

beforeEach(() => {
  urls.length = 0;
  window.localStorage.setItem("cortex.reviewExport", "1");
});
afterEach(() => {
  cleanup();
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

  it("a format cortex has never seen passes verbatim through the real fetch, and the picker offers it", async () => {
    const XLSX = { name: "per-part-xlsx", format: "xlsx", granularity: "notice_part", label: "Excel" };
    const served = withState([...FIXTURE_154_PROFILES, XLSX]);
    reply.data = JSON.parse(JSON.stringify(served));
    expect(await fetchIngestExportProfiles()).toEqual(served);
    const { container } = render(dialog());
    await waitFor(() => expect(container.querySelector('[data-export-profile="per-part-xlsx"]')).not.toBeNull());
    expect(container.querySelector('[data-export-profile="per-part-xlsx"]')?.textContent).toContain("xlsx");
    expect(container.querySelectorAll("[data-export-profile]").length).toBe(3);
  });

  it("a body with an EMPTY granularity element is refused (null from the reader, a throw from the call)", async () => {
    reply.data = BAD;
    await expect(fetchIngestExportProfiles()).rejects.toThrow(/malformed \/ingest\/export\/profiles/);
  });

  it("the picker shows its existing failure state for that body", async () => {
    reply.data = withState(BAD);
    const { container } = render(dialog());
    await waitFor(() => expect(container.querySelector("[data-export-dialog]")?.getAttribute("data-export-dialog")).toBe("failed"));
    expect(container.querySelector("[data-export-failed]")?.textContent).toContain("malformed /ingest/export/profiles");
    expect(container.querySelector("[data-export-profile]")).toBeNull();
  });
});
