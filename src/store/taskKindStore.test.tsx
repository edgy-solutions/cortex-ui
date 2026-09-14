/**
 * THE EDGE THAT WAS MISSING — the card read a declaration nothing ever supplied.
 *
 * `ApprovalTaskCard` was built to render from a served declaration and tested against
 * declarations handed straight into the component. `taskArtifact.ts` builds the APPROVAL_TASK
 * payload and has no such field, so **the declaration path was dead code** and every card fell
 * back to the five-kind interim table it was written to replace.
 *
 * Every node verified, the connection unasserted — the fourth time in this engagement, and this
 * time my own component tests were what made it invisible: passing a declaration IN proves the
 * component works and says nothing about whether anything supplies one.
 *
 * The other lane's parity seal caught the CONSEQUENCE (a newly declared species reported as
 * unknown to cortex) rather than the cause. This file is the cause.
 *
 * ── WHAT THESE SEALS CANNOT DISTINGUISH ───────────────────────────────────────────────────
 *
 * They cannot tell a menu that is genuinely empty from one this client has not loaded yet —
 * both leave `declarationFor` returning null, and both correctly fall back. The store keeps the
 * two apart in `status` (`loaded` versus `idle`/`unreachable`) precisely because the card must
 * not report a species as undeclared on the strength of a pending fetch.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";

const fetchTaskKinds = vi.fn();
vi.mock("@/api/client", () => ({
  fetchTaskKinds: (...a: unknown[]) => fetchTaskKinds(...a),
  actOnHumanTask: vi.fn(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { useTaskKindStore } from "./useTaskKindStore";
import { ApprovalTaskCard, type ApprovalTaskPayload } from "@/components/ApprovalTask/ApprovalTaskCard";

/** Captured from `declaration_for(...)` in the serving cortex-bff pod. */
const LIVE = [
  {
    kind: "risk_acceptance_high",
    declared: true,
    archetype: "APPROVAL_TASK",
    badge: "ACCEPT-H",
    title: "High risk acceptance",
    accepts: ["accepted", "rejected", "returned_for_rework"],
    reason_required: ["accepted", "rejected"],
  },
  {
    kind: "pcn_disposition",
    declared: true,
    archetype: "APPROVAL_TASK",
    badge: "DISPOSE",
    title: "PCN disposition",
    accepts: ["approved", "rejected"],
    reason_required: [],
  },
];

const task = (kind: string): ApprovalTaskPayload => ({
  task_id: "t1",
  kind,
  task_state: "pending",
  title: "A task",
  summary: "",
  audience: "stewards",
  requested_by: "bob",
  subject_ref: null,
});

const verbs = () =>
  [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));

beforeEach(() => {
  fetchTaskKinds.mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});
afterEach(cleanup);

describe("the menu reaches the card", () => {
  it("a species the interim table never knew gets its declared verbs", async () => {
    // THE DEFECT, stated as the fix. `risk_acceptance_high` is not in the five-kind table, so
    // before this the card drew "unknown species here" with no buttons.
    fetchTaskKinds.mockResolvedValue(LIVE);
    await useTaskKindStore.getState().load();

    render(<ApprovalTaskCard task={task("risk_acceptance_high")} />);
    expect(verbs()).toEqual(["accepted", "rejected", "returned_for_rework"]);
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("the ROW's declaration still wins over the menu — the more specific claim", async () => {
    fetchTaskKinds.mockResolvedValue(LIVE);
    await useTaskKindStore.getState().load();
    render(
      <ApprovalTaskCard
        task={{
          ...task("risk_acceptance_high"),
          declaration: { kind: "risk_acceptance_high", declared: true, accepts: ["accepted"] },
        }}
      />,
    );
    expect(verbs()).toEqual(["accepted"]);
  });

  it("falls back to the interim table while the menu is UNLOADED", () => {
    // Not "undeclared". Reporting a species as unknown on the strength of a pending fetch is a
    // claim about the deployment made from a race.
    render(<ApprovalTaskCard task={task("pcn_disposition")} />);
    expect(verbs()).toEqual(["approved", "rejected"]);
  });

  it("falls back when the menu is UNREACHABLE, rather than declaring nothing", async () => {
    fetchTaskKinds.mockResolvedValue(null);
    await useTaskKindStore.getState().load();
    expect(useTaskKindStore.getState().status).toBe("unreachable");
    render(<ApprovalTaskCard task={task("pcn_disposition")} />);
    expect(verbs()).toEqual(["approved", "rejected"]);
  });

  it("an UNREACHABLE menu is not an EMPTY one", async () => {
    // The split this codebase keeps finding. An empty menu would mean the mesh declares no
    // species; a failed request means this client could not ask.
    fetchTaskKinds.mockResolvedValue(null);
    await useTaskKindStore.getState().load();
    expect(useTaskKindStore.getState().status).toBe("unreachable");

    useTaskKindStore.setState({ status: "idle", byKind: {} });
    fetchTaskKinds.mockResolvedValue([]);
    await useTaskKindStore.getState().load();
    expect(useTaskKindStore.getState().status).toBe("loaded");
  });
});

describe("the menu is fetched once", () => {
  it("a second load while one is in flight starts no second request", async () => {
    // Mounted from a component, so React will call it more than once.
    let resolve: (v: unknown) => void = () => {};
    fetchTaskKinds.mockReturnValue(new Promise((r) => (resolve = r)));
    const first = useTaskKindStore.getState().load();
    await useTaskKindStore.getState().load();
    expect(fetchTaskKinds).toHaveBeenCalledTimes(1);
    resolve(LIVE);
    await first;
    expect(useTaskKindStore.getState().status).toBe("loaded");
  });

  it("and none after it has loaded", async () => {
    fetchTaskKinds.mockResolvedValue(LIVE);
    await useTaskKindStore.getState().load();
    await useTaskKindStore.getState().load();
    expect(fetchTaskKinds).toHaveBeenCalledTimes(1);
  });

  it("DROPS a row the reader refuses rather than half-keeping it", async () => {
    // A declaration that cannot name its species, or cannot say whether it is declared, is not
    // one — see `readTaskDeclaration`. Keeping it would put an unusable entry under some key.
    fetchTaskKinds.mockResolvedValue([...LIVE, { accepts: ["x"] }, { kind: "k" }]);
    await useTaskKindStore.getState().load();
    expect(Object.keys(useTaskKindStore.getState().byKind).sort()).toEqual([
      "pcn_disposition",
      "risk_acceptance_high",
    ]);
  });

  it("a hostile kind string does not reach through the prototype", async () => {
    fetchTaskKinds.mockResolvedValue(LIVE);
    await useTaskKindStore.getState().load();
    for (const hostile of ["constructor", "toString", "__proto__"]) {
      expect(useTaskKindStore.getState().declarationFor(hostile), hostile).toBeNull();
    }
  });
});
