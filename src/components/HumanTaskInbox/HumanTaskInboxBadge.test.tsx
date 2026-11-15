/**
 * THE TASKS BADGE reads the served queue state (0.4.89).
 *  Q8  a failed refresh after a good snapshot: rows kept, `data-queue-error` with the message; the next success clears it.
 *  Q9  before the first snapshot: no number, `queueLoaded` false.
 *  Q10 the number is the SERVED total (it differs from the list length here); the title carries the served kinds in order.
 *  Q11 a served delegation mark: `data-delegated`, the delegator named.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, cleanup, act } from "@testing-library/react";
import { HumanTaskInboxBadge } from "./HumanTaskInboxBadge";
import { useHumanTaskStore, type QueueSnapshot } from "@/store/useHumanTaskStore";
import { humanTaskFromRow } from "@/lib/seedHumanTasks";

const row = (n: string) => humanTaskFromRow({ id: n, task_id: `t-${n}`, kind: "k", status: "pending", title: n, created_at: 1 })!;
const snap = (over: Partial<QueueSnapshot> = {}): QueueSnapshot => ({
  tasks: [row("a")],
  needsYou: { counts: { zeta: 3, alpha: 4 }, total: 7 },
  delegated: null,
  ...over,
});
const apply = (s: QueueSnapshot) => act(() => { const t = useHumanTaskStore.getState().beginSnapshot(); useHumanTaskStore.getState().applyQueue(s, t); });
const fail = (m: string) => act(() => { const t = useHumanTaskStore.getState().beginSnapshot(); useHumanTaskStore.getState().failQueue(m, t); });
const btn = () => document.querySelector("button[title]") as HTMLButtonElement;

beforeEach(() => useHumanTaskStore.getState().reset());
afterEach(cleanup);

describe("HumanTaskInboxBadge", () => {
  it("Q9: before the first snapshot there is no number and the store is not loaded", () => {
    render(<HumanTaskInboxBadge />);
    expect(useHumanTaskStore.getState().queueLoaded).toBe(false);
    expect(btn().textContent).not.toMatch(/\d/);
    expect(btn().title).toContain("Tasks not loaded yet");
  });

  it("Q10: the number is the served total, not the list length; the title lists the served kinds in served order", () => {
    render(<HumanTaskInboxBadge />);
    apply(snap());
    expect(useHumanTaskStore.getState().tasks).toHaveLength(1);
    expect(btn().textContent).toContain("7");
    expect(btn().textContent).not.toMatch(/\b1\b/);
    expect(btn().title).toContain("zeta 3, alpha 4");
  });

  it("Q10: a served total of zero shows no number even when the list has a row", () => {
    render(<HumanTaskInboxBadge />);
    apply(snap({ needsYou: { counts: {}, total: 0 } }));
    expect(btn().textContent).not.toMatch(/\d/);
  });

  it("Q8: a failure after a good snapshot keeps the rows, shows the message, and the next success clears it", () => {
    render(<HumanTaskInboxBadge />);
    apply(snap());
    fail("authorization_unavailable");
    expect(useHumanTaskStore.getState().tasks).toHaveLength(1);
    expect(btn().hasAttribute("data-queue-error")).toBe(true);
    expect(btn().title).toContain("authorization_unavailable");
    expect(btn().textContent).toContain("unavailable");
    apply(snap());
    expect(btn().hasAttribute("data-queue-error")).toBe(false);
    expect(btn().title).not.toContain("authorization_unavailable");
  });

  it("Q11: a served delegation mark sets data-delegated and names the delegator; none, no attribute", () => {
    render(<HumanTaskInboxBadge />);
    apply(snap());
    expect(btn().hasAttribute("data-delegated")).toBe(false);
    apply(snap({ delegated: { delegated: true, delegator: "boss@example.org", delegate: "me", expires_at: "x", row_id: "r", read_at: "y" } }));
    expect(btn().hasAttribute("data-delegated")).toBe(true);
    expect(btn().textContent).toContain("boss@example.org");
    expect(btn().title).toContain("boss@example.org");
  });
});
