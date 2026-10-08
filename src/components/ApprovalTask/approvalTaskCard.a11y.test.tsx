/**
 * ACCESSIBILITY SEALS for ApprovalTaskCard: a named reason field, announced refusals and
 * outcomes, typed buttons — and an AST pass over the card source so a later edit cannot quietly
 * put a clickable div or an unlabeled field back. Fixtures are copied from approvalTaskCard.test.tsx.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskKindStore } from "@/store/useTaskKindStore";

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

const ACCEPT = {
  kind: "risk_acceptance_medium",
  declared: true,
  archetype: "APPROVAL_TASK",
  badge: "ACCEPT-M",
  title: "Medium risk acceptance",
  accepts: ["accepted", "rejected"],
  reason_required: [],
};
const DISMISS = {
  kind: "hazard_link_review",
  declared: true,
  archetype: "GROUPED_REVIEW",
  badge: "LINK",
  title: "Hazard link review",
  accepts: ["linked", "new_hazard", "dismissed"],
  reason_required: ["dismissed", "new_hazard"],
};

const refusal422 = (detail: Record<string, unknown>) =>
  Object.assign(new Error("Request failed with status code 422"), {
    response: { status: 422, data: { detail } },
  });

beforeEach(() => {
  actOnHumanTask.mockReset();
  useTaskKindStore.setState({ status: "idle", byKind: {} });
});
afterEach(cleanup);

describe("ApprovalTaskCard a11y: labels and buttons", () => {
  it("the reason textbox is found by its accessible name", () => {
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: DISMISS }} />);
    expect(screen.getByRole("textbox", { name: /reason for decision/i })).toBeTruthy();
  });

  it("every action button has a name, a type, and no negative tabIndex", () => {
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: DISMISS }} />);
    for (const name of [/linked/i, /new.hazard/i, /dismissed/i]) {
      const b = screen.getByRole("button", { name }) as HTMLButtonElement;
      expect(b.type).toBe("button");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ApprovalTaskCard a11y: live regions", () => {
  it("a 422 refusal is reachable by role alert and carries its text", async () => {
    actOnHumanTask.mockRejectedValue(
      refusal422({ error: "reason_required", message: "accepted requires a reason" }),
    );
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_medium"), declaration: ACCEPT }} />);
    fireEvent.click(document.querySelector('[data-verb="accepted"]')!);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("accepted requires a reason");
    expect(alert.hasAttribute("data-act-refusal")).toBe(true);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("a corrected menu is reachable by role alert", async () => {
    actOnHumanTask.mockRejectedValue(
      refusal422({
        error: "invalid_decision_for_kind",
        kind: "risk_acceptance_high",
        allowed: ["accepted"],
        message: "approved is not valid for this kind",
      }),
    );
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    const alert = await screen.findByRole("alert");
    expect(alert.hasAttribute("data-decision-corrected")).toBe(true);
    expect(alert.textContent).toContain("approved is not valid for this kind");
  });

  it("an undeclared kind is reachable by role alert", () => {
    render(<ApprovalTaskCard task={task("no_such_kind_anywhere")} />);
    const alert = screen.getByRole("alert");
    expect(alert.hasAttribute("data-undeclared-kind")).toBe(true);
    expect(alert.textContent).toMatch(/unknown species here/i);
  });

  it("an audience/kind contradiction is reachable by role alert", () => {
    const declared = (kind: string) => ({
      kind,
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "X",
      title: "X",
      accepts: ["approved", "rejected"],
      reason_required: [],
    });
    useTaskKindStore.setState({
      status: "loaded",
      byKind: { workflow_ack: declared("workflow_ack"), risk_acceptance_medium: declared("risk_acceptance_medium") },
    } as never);
    render(
      <ApprovalTaskCard
        task={task("workflow_ack", {
          audience: "risk_acceptance_medium:SUSTAINMENT",
          subject_ref: "HAZ-1003",
        })}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert.hasAttribute("data-kind-contradiction")).toBe(true);
    expect(alert.textContent).toMatch(/audience and kind disagree/i);
  });

  it("the outcome is reachable by role status", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: true });
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_medium"), declaration: ACCEPT }} />);
    fireEvent.click(document.querySelector('[data-verb="accepted"]')!);
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Accepted"));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("ApprovalTaskCard a11y: AST seal over the card source", () => {
  const FILE = join(__dirname, "ApprovalTaskCard.tsx");
  const readSrc = () => readFileSync(FILE, "utf8");

  type El = { tag: string; attrs: Set<string>; values: Record<string, string>; line: number };
  const elements = (text: string): El[] => {
    const out: El[] = [];
    const sf = ts.createSourceFile("card.tsx", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const walk = (n: ts.Node) => {
      if (ts.isJsxOpeningElement(n) || ts.isJsxSelfClosingElement(n)) {
        const attrs = new Set<string>();
        const values: Record<string, string> = {};
        for (const p of n.attributes.properties) {
          if (ts.isJsxAttribute(p)) {
            attrs.add(p.name.getText());
            values[p.name.getText()] = p.initializer ? p.initializer.getText() : "";
          }
        }
        const line = sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
        out.push({ tag: n.tagName.getText(), attrs, values, line });
      }
      ts.forEachChild(n, walk);
    };
    walk(sf);
    return out.filter((e) => /^[a-z]/.test(e.tag)); // intrinsic elements only
  };
  const HANDLERS = ["onClick", "onKeyDown", "onMouseDown"];
  const INTERACTIVE = new Set(["button", "input", "textarea", "select", "a"]);

  it("(a) no non-interactive intrinsic element is clickable without role and tabIndex", () => {
    const withHandler = elements(readSrc()).filter((e) => HANDLERS.some((h) => e.attrs.has(h)));
    // Census before the pass: 1 (the verb button).
    expect(withHandler.length, "population floor: handler-bearing elements inspected").toBeGreaterThanOrEqual(1);
    const bad = withHandler.filter(
      (e) => !INTERACTIVE.has(e.tag) && !(e.attrs.has("role") && e.attrs.has("tabIndex")),
    );
    expect(bad.map((e) => `L${e.line} <${e.tag}> is clickable but not keyboard-reachable`)).toEqual([]);
  });

  it("(b) every input/textarea/select has an accessible name", () => {
    const all = elements(readSrc());
    const fields = all.filter((e) => ["input", "textarea", "select"].includes(e.tag));
    // Census before the pass: 1 (the reason input).
    expect(fields.length, "population floor: fields inspected").toBeGreaterThanOrEqual(1);
    const labelFor = new Set(all.filter((e) => e.tag === "label").map((e) => e.values.htmlFor));
    const bad = fields.filter(
      (e) =>
        !(e.attrs.has("aria-label") || e.attrs.has("aria-labelledby")) &&
        !(e.values.id && labelFor.has(e.values.id)),
    );
    expect(bad.map((e) => `L${e.line} <${e.tag}> has no accessible name`)).toEqual([]);
  });

  it("(c) every button has an explicit type", () => {
    const buttons = elements(readSrc()).filter((e) => e.tag === "button");
    // Census before the pass: 1 (the verb button).
    expect(buttons.length, "population floor: buttons inspected").toBeGreaterThanOrEqual(1);
    const bad = buttons.filter((e) => !e.attrs.has("type"));
    expect(bad.map((e) => `L${e.line} <button> has no explicit type`)).toEqual([]);
  });
});
