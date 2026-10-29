/**
 * The grantor's card: the proposer rule, the sha Grant names, the verbs from the task, a reason-required
 * verb, the moved proposal, "access granted" only after the sync completes, and the flag-off fallthrough.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ on: true, email: "alice" as string | null }));
const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({ actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({ user: h.email ? { profile: { email: h.email } } : null }),
}));
vi.mock("@/lib/accessFlag", () => ({
  isAccessRequestsEnabled: () => h.on,
  isAccessRequestsMockEnabled: () => false,
}));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "@/components/ApprovalTask/ApprovalTaskCard";
import { useTaskKindStore } from "@/store/useTaskKindStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { PROPOSED_FIXTURE_GRANT_TASK } from "@/lib/accessProposal";
import { httpError } from "@/lib/policyRefusalFixture";

const SHA = PROPOSED_FIXTURE_GRANT_TASK.head_sha;
const decl = (accepts: string[], reasonRequired: string[] = []) => ({
  kind: "access_grant_review",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "GRANT",
  title: "Review an access grant",
  accepts,
  reason_required: reasonRequired,
});
const task = (over: Partial<ApprovalTaskPayload> = {}, payload: Record<string, unknown> = {}): ApprovalTaskPayload => ({
  task_id: "task-synthetic-0001",
  kind: "access_grant_review",
  task_state: "pending",
  title: "Grant bob access",
  summary: "",
  audience: "grantors",
  requested_by: "svc:engine-r",
  subject_ref: "prop-synthetic-0001",
  declaration: decl(["approved", "rejected"], ["rejected"]),
  payload: { ...PROPOSED_FIXTURE_GRANT_TASK, ...payload },
  ...over,
});

const verbs = () => [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));
const btn = (v: string) => document.querySelector(`[data-verb="${v}"]`) as HTMLButtonElement;

beforeEach(() => {
  h.on = true;
  h.email = "alice";
  actOnHumanTask.mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
  usePersonaStore.setState({ entitlements: null } as never);
});
afterEach(cleanup);

describe("GrantReviewCard", () => {
  it("draws the top line, one row per change, and the diff verbatim", () => {
    render(<ApprovalTaskCard task={task()} />);
    const top = document.querySelector("[data-grant-topline]")!;
    for (const s of ["bob", "program_members", "member(NP-MERIDIAN)", "prop-synthetic-0001", SHA.slice(0, 7), "main"]) {
      expect(top.textContent).toContain(s);
    }
    expect(document.querySelector("[data-grant-sha]")?.getAttribute("title")).toBe(SHA);
    expect(document.querySelectorAll("[data-grant-change]")).toHaveLength(1);
    expect(document.querySelector("[data-grant-diff]")?.textContent).toBe(PROPOSED_FIXTURE_GRANT_TASK.diff);
  });
  it("the proposer sees no verb buttons", () => {
    h.email = "bob";
    render(<ApprovalTaskCard task={task()} />);
    expect(verbs()).toEqual([]);
    expect(document.querySelector("[data-grant-own-proposal]")?.textContent).toBe(
      "You proposed this; another grantor must review it.",
    );
  });
  it("Grant names the head sha", () => {
    render(<ApprovalTaskCard task={task()} />);
    expect(btn("approved").textContent).toBe(`Grant ${SHA.slice(0, 7)}`);
  });
  it("the verbs come from the task: an unusual list shows exactly those", () => {
    render(<ApprovalTaskCard task={task({ declaration: decl(["acknowledged", "deferred", "rejected"]) })} />);
    expect(verbs()).toEqual(["acknowledged", "deferred", "rejected"]);
  });
  it("a reason-required verb is disabled until a note is typed, and the note is posted", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    render(<ApprovalTaskCard task={task()} />);
    expect(btn("rejected").disabled).toBe(true);
    expect(btn("approved").disabled).toBe(false);
    fireEvent.change(document.querySelector("[data-grant-note]")!, { target: { value: "not this quarter" } });
    expect(btn("rejected").disabled).toBe(false);
    fireEvent.click(btn("rejected"));
    await waitFor(() => expect(actOnHumanTask).toHaveBeenCalledWith("task-synthetic-0001", "rejected", "not this quarter"));
  });
  it("proposal_moved renders", async () => {
    actOnHumanTask.mockRejectedValue(httpError(409, { error: "proposal_moved", message: "head moved" }));
    render(<ApprovalTaskCard task={task()} />);
    fireEvent.click(btn("approved"));
    await waitFor(() => expect(document.querySelector("[data-grant-moved]")).not.toBeNull());
    expect(document.querySelector("[data-grant-moved]")?.textContent).toBe("The proposal changed after review.");
  });
  it("says access granted only when the sync is complete", () => {
    const merged = { merge_sha: "m".repeat(40) };
    const { rerender } = render(<ApprovalTaskCard task={task({}, { ...merged, sync_state: "running" })} />);
    expect(document.querySelector("[data-grant-merge]")?.textContent).toBe("m".repeat(40));
    expect(document.querySelector("[data-grant-sync]")?.textContent).toBe("running");
    expect(document.body.textContent ?? "").not.toMatch(/access granted/i);
    expect(document.body.textContent ?? "").toContain("Merged; syncing…");
    rerender(<ApprovalTaskCard task={task({}, { ...merged, sync_state: "complete" })} />);
    expect(document.body.textContent ?? "").toMatch(/access granted/i);
    rerender(<ApprovalTaskCard task={task({}, { ...merged, sync_state: "failed" })} />);
    expect(document.body.textContent ?? "").not.toMatch(/access granted/i);
    expect(document.body.textContent ?? "").toContain("Merged; sync failed");
  });
  it("with the flag off the same task draws the generic card", () => {
    h.on = false;
    render(<ApprovalTaskCard task={task()} />);
    expect(document.querySelector("[data-grant-review]")).toBeNull();
    expect(verbs()).toEqual(["approved", "rejected"]);
    expect(document.querySelector("[data-reason-input]")).not.toBeNull();
  });
});
