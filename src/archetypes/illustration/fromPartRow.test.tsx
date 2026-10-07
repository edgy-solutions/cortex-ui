/**
 * `illustrationFromPartRow`'s seals — item 3b, Build §3. Drives the real `Illustration` card
 * (direct import, same component the registry wires up — see `index.ts`), with `@/api/client`
 * mocked the same way `Card.test.tsx` mocks it: every field but `fetchIllustrationContent` is the
 * real module, and that one default-resolves to a promise that never settles, so a test that
 * forgets to stub it reads "loading", never a crash read as a verdict.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { cleanup, render, waitFor } from "@testing-library/react";
import { Illustration } from "./Card";
import { fetchIllustrationContent } from "@/api/client";
import { SVG_FIXTURE } from "./fixtures";
import {
  BRIDGE_PART_ROW_NO_ICN,
  BRIDGE_PART_ROW_NO_ICN_ILLUSTRATION,
  HAND_BUILT_ILLUSTRATION,
  HAND_BUILT_NO_HOTSPOT_ILLUSTRATION,
  HAND_BUILT_PART_ROW,
  MAINT_PART_WITH_ICN_ILLUSTRATION,
  MAINT_PART_WITH_ICN_ROW,
} from "./fixtures/fromPartRow";
import { illustrationFromPartRow, PART_ROW_ILLUSTRATION_READS, PART_ROW_ILLUSTRATION_UNREAD } from "./fromPartRow";
import { MIRRORED_FIELDS } from "@/api/maintenanceBridgeTypes";

vi.mock("@/api/client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/api/client")>()),
  fetchIllustrationContent: vi.fn(() => new Promise<string>(() => {})),
}));

const mockFetch = fetchIllustrationContent as unknown as Mock;

beforeEach(() => {
  mockFetch.mockImplementation(() => Promise.resolve(SVG_FIXTURE));
});

afterEach(() => {
  cleanup();
  mockFetch.mockReset();
  mockFetch.mockImplementation(() => Promise.resolve(SVG_FIXTURE));
});

async function settle(container: ParentNode) {
  await waitFor(() => {
    const el = container.querySelector('[data-archetype="ILLUSTRATION"]');
    const state = el?.getAttribute("data-illustration-state");
    expect(state).not.toBe("loading");
    // "drawn" is an attribute committed in RENDER, but the SVG (and the hotspot highlight it
    // carries) is appended by a PASSIVE effect that runs after that commit. Stopping at "not
    // loading" raced it: CI on d7d6593 saw hotspot "found" with ZERO highlighted elements. So a
    // drawn card is settled only once its SVG is actually in the canvas.
    if (state === "drawn") expect(el?.querySelector("[data-illustration-canvas] svg")).not.toBeNull();
  });
}

describe("arm 1 — (b) hand-built: the hotspot that matches is highlighted, and only it", () => {
  it("highlights exactly the element whose id === hotspot_id", async () => {
    expect(HAND_BUILT_PART_ROW.hotspot_id).toBe("hot-001");
    const { container } = render(<Illustration illustration={HAND_BUILT_ILLUSTRATION} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="found"]')).not.toBeNull();
    const highlighted = container.querySelectorAll("[data-hotspot-highlighted]");
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].getAttribute("id")).toBe("hot-001");
  });
});

describe("arm 2 — (a) MAINT_PART_WITH_ICN projected as-is: icn shown, no bytes route, no fetch", () => {
  it("draws the icn text and the card's no-bytes-route absence, and makes no fetch call", () => {
    const { container } = render(<Illustration illustration={MAINT_PART_WITH_ICN_ILLUSTRATION} />);
    // `MAINT_PART_WITH_ICN_ILLUSTRATION` carries neither `media_type` nor `content_path` (no
    // `opts` were passed — see fixtures/fromPartRow.ts's own comment on fixture (a)). Card.tsx's
    // `computeStaticState` checks `media_type` before `content_path`, so with BOTH null the state
    // that actually fires is "media-unknown", not "unserved" — still one of the four states that
    // never fetch, and still the absence this projection's "no opts" choice produces.
    const el = container.querySelector('[data-illustration-state="media-unknown"]');
    expect(el).not.toBeNull();
    expect(container.querySelector("[data-illustration-icn]")?.textContent).toBe(
      MAINT_PART_WITH_ICN_ILLUSTRATION?.icn,
    );
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("S4's target: content_path stays null — never fabricated from the icn (M9's shape, S4's own)", () => {
    // `media_type` being null already stops the card from fetching (the assertion above), so a
    // fabricated `/icn/${icn}` path would NOT redden that assertion — it hides behind the
    // media-unknown short-circuit. This checks the payload field directly instead.
    expect(MAINT_PART_WITH_ICN_ILLUSTRATION?.content_path).toBeNull();
  });

  it("S3's target: part_ref is never mapped into part.part_number — part carries only item", () => {
    // Dedicated arm for mutant S3 (see this file's own mutant table in the spec): the census arm
    // (arm 5) only proves PART_ROW_ILLUSTRATION_READS/_UNREAD partition WirePartRow's field set —
    // it does not inspect what illustrationFromPartRow actually DOES with any one field, so a
    // mutant that mapped part_ref into part_number would not redden it. This does.
    expect(MAINT_PART_WITH_ICN_ROW.part_ref).toBe("ref-2");
    expect(MAINT_PART_WITH_ICN_ILLUSTRATION?.part).toEqual({ item: MAINT_PART_WITH_ICN_ROW.item });
    expect(Object.prototype.hasOwnProperty.call(MAINT_PART_WITH_ICN_ILLUSTRATION?.part ?? {}, "part_number")).toBe(
      false,
    );
  });
});

describe("arm 3 — (c) the bridge's default part row (no icn) projects to null", () => {
  it("illustrationFromPartRow returns null", () => {
    expect(BRIDGE_PART_ROW_NO_ICN.icn).toBeNull();
    expect(BRIDGE_PART_ROW_NO_ICN_ILLUSTRATION).toBeNull();
  });

  it("so nothing is rendered by any caller — the card draws only its absence note", () => {
    const { container } = render(<Illustration illustration={BRIDGE_PART_ROW_NO_ICN_ILLUSTRATION} />);
    expect(container.querySelector("[data-illustration-absent]")).not.toBeNull();
    expect(container.querySelector('[data-archetype="ILLUSTRATION"]')).toBeNull();
  });
});

describe("arm 4 — icn present, hotspot_id null: drawn, no highlight, and no first-hotspot fallback", () => {
  it("draws with hotspot state 'none' and highlights nothing", async () => {
    const { container } = render(<Illustration illustration={HAND_BUILT_NO_HOTSPOT_ILLUSTRATION} />);
    await settle(container);
    expect(container.querySelector('[data-illustration-hotspot="none"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-hotspot-highlighted]")).toHaveLength(0);
    expect(container.textContent).toContain("names no hotspot");
  });
});

describe("arm 5 — the census: PART_ROW_ILLUSTRATION_READS ∪ _UNREAD is WirePartRow's whole field set", () => {
  it("neither list has a duplicate, and the two lists do not overlap", () => {
    expect(new Set(PART_ROW_ILLUSTRATION_READS).size).toBe(PART_ROW_ILLUSTRATION_READS.length);
    expect(new Set(PART_ROW_ILLUSTRATION_UNREAD).size).toBe(PART_ROW_ILLUSTRATION_UNREAD.length);
    const overlap = PART_ROW_ILLUSTRATION_READS.filter((f) =>
      (PART_ROW_ILLUSTRATION_UNREAD as readonly string[]).includes(f),
    );
    expect(overlap).toEqual([]);
  });

  it("READS ∪ UNREAD equals every field MIRRORED_FIELDS.PartRow declares (S5's target)", () => {
    const declared = [...PART_ROW_ILLUSTRATION_READS, ...PART_ROW_ILLUSTRATION_UNREAD].slice().sort();
    const population = Object.keys(MIRRORED_FIELDS.PartRow).slice().sort();
    expect(declared).toEqual(population);
  });
});

it.todo(
  "mount on the case card when ADR-0055 grants WORKFLOW_CASE a parts field — today work_order.parts is UNDRAWN",
);
it.todo("replace placeholder icn/hotspot with a served IPD capture — no producer emits icn/hotspot_id yet");

// Exercises illustrationFromPartRow directly, outside the card, to pin S1/S2's exact-value shape
// (the card-level arms above already prove the DRAWN consequence; these pin the projector itself).
describe("illustrationFromPartRow — direct, non-card assertions backing S1/S2", () => {
  it("S1's target: icn '' must return null, not a payload with an empty icn", () => {
    expect(illustrationFromPartRow({ ...HAND_BUILT_PART_ROW, icn: "" })).toBeNull();
    expect(illustrationFromPartRow({ ...HAND_BUILT_PART_ROW, icn: null })).toBeNull();
  });

  it("S2's target: hotspot_id null is passed through as null, never a fabricated first-hotspot or ''", () => {
    const result = illustrationFromPartRow({ ...HAND_BUILT_PART_ROW, hotspot_id: null });
    expect(result?.hotspot_id).toBeNull();
  });
});
