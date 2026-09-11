/**
 * AN UNDECLARED TASK KIND GETS NO VERBS.
 *
 * ── THE HOLE ──────────────────────────────────────────────────────────────────────────────
 *
 * This card offered Approve and Reject to EVERY kind that reached it — and an unregistered kind
 * reaches it BY DEFAULT, because `taskKindRegistry`'s fallback archetype is APPROVAL_TASK. So
 * any task species nobody had declared arrived here and was handed two buttons.
 *
 * Not a labelling problem. Pressing one posts a decision through `/act`, and ADR-0034 archives
 * decision records immutably as promotion evidence, so the cost of guessing is a permanent
 * record of a judgement the data may not represent. "Approve" on *this notice could not be
 * prepared for review* is the case that produced the TRIAGE_TASK species, and it shipped
 * exactly this way.
 *
 * ── WHAT THIS SEAL CANNOT DISTINGUISH ─────────────────────────────────────────────────────
 *
 * It cannot tell a kind that is undeclared because nobody has registered it yet from one that
 * is undeclared because the registry itself failed to load — both render the same refusal, and
 * both are correctly refused. The difference matters for the REPAIR, not for the affordance,
 * and the registry is a module constant today so the second case is not reachable. When the
 * served `TaskKind` row replaces it, that distinction becomes real (fetched-and-absent versus
 * could-not-fetch, the split this codebase keeps finding) and it will need its own state here.
 *
 * It also cannot tell whether `/act` would have ACCEPTED the decision. It asserts what the card
 * offers, never what the backend permits — `_VERBS_BY_KIND` is the other half of this pair and
 * lives in another repo.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";

const task = (kind: string, over: Partial<ApprovalTaskPayload> = {}): ApprovalTaskPayload => ({
  task_id: "t1",
  kind,
  task_state: "pending",
  title: "Approve the thing",
  summary: "A summary of the thing",
  audience: "stewards",
  requested_by: "bob",
  subject_ref: null,
  ...over,
});

beforeEach(() => actOnHumanTask.mockReset());
afterEach(cleanup);

const buttons = () =>
  screen.queryAllByRole("button").map((b) => (b.textContent ?? "").trim());

describe("a DECLARED kind keeps its verbs", () => {
  it("offers Approve and Reject", () => {
    // The positive control, and it carries the whole file: a card that showed no buttons for
    // anything would pass every refusal assertion below.
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    expect(buttons().join(" ")).toContain("Approve");
    expect(buttons().join(" ")).toContain("Reject");
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("still acts through the sealed bridge", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={task("access_request")} />);
    fireEvent.click(screen.getByText("Approve"));
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "approved");
  });
});

describe("an UNDECLARED kind gets none", () => {
  it("renders no Approve and no Reject", () => {
    render(<ApprovalTaskCard task={task("some_kind_nobody_declared")} />);
    expect(buttons()).toEqual([]);
  });

  it("says which kind it could not place, INSIDE the refusal", () => {
    // A card that just dropped the buttons would look like a task already decided. The refusal
    // has to be legible or it reads as a different state entirely.
    //
    // SCOPED TO THE REFUSAL BLOCK, and the first version was not. It asserted the kind appeared
    // in `document.body` — and the kind is ALSO printed in the card header two lines up, so
    // stripping it out of the refusal left the assertion passing. A mutation that removed the
    // name from the message survived. The instrument and the subject sharing a surface: the
    // check has to ask the element that makes the claim, not the page that contains it.
    render(<ApprovalTaskCard task={task("some_kind_nobody_declared")} />);
    const refusal = document.querySelector("[data-undeclared-kind]")!;
    expect(refusal).not.toBeNull();
    expect(refusal.textContent).toMatch(/unknown species here/i);
    expect(refusal.textContent).toContain("some_kind_nobody_declared");
    // Positive control that the scoping is real: the header carries it too, so an unscoped
    // assertion could never have failed.
    expect(document.body.textContent).toContain("some_kind_nobody_declared");
  });

  it("is NOT a disabled button — that would still claim the species", () => {
    // A greyed Approve says "this IS an approval, you merely cannot do it right now", which is
    // the claim that has no declaration behind it. There must be no approve/reject control at
    // all, enabled or otherwise.
    render(<ApprovalTaskCard task={task("some_kind_nobody_declared")} />);
    expect(screen.queryByText("Approve")).toBeNull();
    expect(screen.queryByText("Reject")).toBeNull();
    expect(document.querySelectorAll("button")).toHaveLength(0);
  });

  it("cannot act even if something reaches the handler", () => {
    // Belt and braces on the thing that matters: no path from this render posts a decision.
    render(<ApprovalTaskCard task={task("some_kind_nobody_declared")} />);
    for (const b of screen.queryAllByRole("button")) fireEvent.click(b);
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("still READS the task in full — only deciding needs a declaration", () => {
    // Refusing to show the task would be a second, larger claim: that the row is untrustworthy.
    // It is not. Nothing knows what its decisions MEAN.
    render(<ApprovalTaskCard task={task("some_kind_nobody_declared")} />);
    expect(screen.getByText("Approve the thing")).toBeTruthy();
    expect(screen.getByText("A summary of the thing")).toBeTruthy();
    expect(document.body.textContent).toContain("bob");
  });
});

describe("the default-deny survives a hostile kind string", () => {
  it("a prototype key is NOT a declared kind", () => {
    // `kind` is a PROJECTION FIELD — it arrives from data. `REGISTRY["constructor"]` walks
    // Object.prototype and returns a function, which once made builtins report as registered
    // kinds. That bug reached the badge; reaching THIS check would hand two buttons to a task
    // species that does not exist.
    for (const hostile of ["constructor", "toString", "__proto__", "hasOwnProperty"]) {
      const { unmount } = render(<ApprovalTaskCard task={task(hostile)} />);
      expect(buttons(), hostile).toEqual([]);
      expect(document.querySelector("[data-undeclared-kind]"), hostile).not.toBeNull();
      unmount();
    }
  });

  it("an empty kind is undeclared, not a default approval", () => {
    render(<ApprovalTaskCard task={task("")} />);
    expect(buttons()).toEqual([]);
  });
});
