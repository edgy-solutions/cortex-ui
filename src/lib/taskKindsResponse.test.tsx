/**
 * THE SERVED MENU WAS NEVER READ.
 *
 * `GET /task_kinds` (`gateway.py` ~line 840, identical at deployed fleet `700f0bc4` and
 * origin/master) returns `{composed: true, kinds: {<kind>: {...}, ...}}` — `kinds` an OBJECT
 * keyed by kind. `fetchTaskKinds` used to accept only a bare array or `{kinds: <array>}`, so on
 * the live wire it always returned null and the store sat at `"unreachable"` forever: no
 * reason-required gate had ever fired, because the one reader that would have fired it was never
 * run against the route's actual shape.
 *
 * `taskKindStore.test.tsx`'s `LIVE` fixture is `declaration_for(...)` output — the Python
 * function, not the HTTP route — so it is already the VALUES of `kinds`, and every test built on
 * it skipped this seam entirely. This file is the route's own shape.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readTaskKindsResponse } from "./taskDeclaration";

const fetchTaskKinds = vi.fn();
vi.mock("@/api/client", () => ({
  fetchTaskKinds: (...a: unknown[]) => fetchTaskKinds(...a),
  actOnHumanTask: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { useTaskKindStore } from "@/store/useTaskKindStore";
import { ApprovalTaskCard } from "@/components/ApprovalTask/ApprovalTaskCard";

/** Shaped as `gateway.py` `/task_kinds` at fleet 700f0bc4 — a capture is requested from Lane 1. */
const ROUTE_BODY = {
  composed: true,
  kinds: {
    risk_acceptance_medium: {
      kind: "risk_acceptance_medium",
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "ACCEPT-M",
      title: "Medium risk acceptance",
      accepts: ["accepted", "rejected", "returned_for_rework"],
      reason_required: ["accepted", "rejected"],
    },
    pcn_disposition: {
      kind: "pcn_disposition",
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "DISPOSE",
      title: "PCN disposition",
      accepts: ["approved", "rejected"],
      reason_required: [],
    },
  },
};

beforeEach(() => {
  fetchTaskKinds.mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});
afterEach(cleanup);

describe("readTaskKindsResponse", () => {
  it("a route-shaped fixture is read into the store's declarations", () => {
    const rows = readTaskKindsResponse(ROUTE_BODY);
    expect(rows).not.toBeNull();
    expect(rows!.map((r) => (r as { kind: string }).kind).sort()).toEqual([
      "pcn_disposition",
      "risk_acceptance_medium",
    ]);
  });

  it("composed:false is NOT an empty menu — null, not []", () => {
    expect(readTaskKindsResponse({ composed: false, kinds: {} })).toBeNull();
    expect(readTaskKindsResponse({ composed: false, kinds: { x: { kind: "x" } } })).toBeNull();
  });

  it("kinds as an array is the OLD, no-longer-served shape — null", () => {
    expect(
      readTaskKindsResponse({ composed: true, kinds: [{ kind: "risk_acceptance_medium" }] }),
    ).toBeNull();
  });

  it("drops an entry whose inner kind disagrees with its key", () => {
    const rows = readTaskKindsResponse({
      composed: true,
      kinds: {
        risk_acceptance_medium: { kind: "something_else", declared: true, accepts: [] },
        pcn_disposition: { kind: "pcn_disposition", declared: true, accepts: ["approved"] },
      },
    });
    expect(rows!.map((r) => (r as { kind: string }).kind)).toEqual(["pcn_disposition"]);
  });

  it("{} has no composed flag — null", () => {
    expect(readTaskKindsResponse({})).toBeNull();
  });

  it("a missing flag and a wrong shape all read as unreachable, same as composed:false", () => {
    expect(readTaskKindsResponse(null)).toBeNull();
    expect(readTaskKindsResponse([])).toBeNull();
    expect(readTaskKindsResponse({ kinds: {} })).toBeNull();
  });
});

describe("the reader's output reaches the card — the connection that was unasserted", () => {
  it("risk_acceptance_medium offers its three verbs and disables `accepted` until a reason is typed", async () => {
    // THE WHOLE CHAIN: the route envelope, through `readTaskKindsResponse` (what `fetchTaskKinds`
    // now does), through the store's `load()`, onto the card. `taskKindStore.test.tsx`'s `LIVE`
    // fixture is `declaration_for(...)` output — already the VALUES of `kinds` — so none of its
    // tests ever ran the envelope shape through this reader. This one does.
    fetchTaskKinds.mockResolvedValue(readTaskKindsResponse(ROUTE_BODY));
    await useTaskKindStore.getState().load();

    render(
      <ApprovalTaskCard
        task={{
          task_id: "t1",
          kind: "risk_acceptance_medium",
          task_state: "pending",
          title: "A task",
          summary: "",
          audience: "risk_acceptance_medium:SUSTAINMENT",
          requested_by: "bob",
          subject_ref: null,
        }}
      />,
    );
    const verbs = [...document.querySelectorAll("[data-verb]")].map((b) =>
      b.getAttribute("data-verb"),
    );
    expect(verbs).toEqual(["accepted", "rejected", "returned_for_rework"]);
    const acceptedBtn = document.querySelector('[data-verb="accepted"]') as HTMLButtonElement;
    expect(acceptedBtn.disabled).toBe(true);
  });
});
