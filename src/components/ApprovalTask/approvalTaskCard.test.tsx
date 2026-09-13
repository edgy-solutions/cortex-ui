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
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const actOnHumanTask = vi.fn();
vi.mock("@/api/client", () => ({
  actOnHumanTask: (...a: unknown[]) => actOnHumanTask(...a),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { toast } from "sonner";
import { markTaskResolvedByTaskId } from "@/lib/useTaskArtifactSync";

import { ApprovalTaskCard, type ApprovalTaskPayload } from "./ApprovalTaskCard";
import { readTaskDeclaration } from "@/lib/taskDeclaration";

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

beforeEach(() => {
  actOnHumanTask.mockReset();
  vi.mocked(toast.error).mockReset();
  vi.mocked(markTaskResolvedByTaskId).mockReset();
});
afterEach(cleanup);

const buttons = () =>
  screen.queryAllByRole("button").map((b) => (b.textContent ?? "").trim());

/**
 * The VERBS offered, read off `data-verb` rather than the label text.
 *
 * Labels are now the declaration's verbs verbatim — "Approved", not "Approve" — because the word
 * on the button is the word that gets POSTED and archived, and on a risk acceptance the reader
 * must see `accepted` rather than a generic approval. That makes label text the wrong selector
 * twice over: it moves with wording, and "Approved" CONTAINS "Approve", so a substring assertion
 * passes whether or not the right verb is on offer.
 */
const verbs = () =>
  [...document.querySelectorAll("[data-verb]")].map((b) => b.getAttribute("data-verb"));

describe("a DECLARED kind keeps its verbs", () => {
  it("offers Approve and Reject", () => {
    // The positive control, and it carries the whole file: a card that showed no buttons for
    // anything would pass every refusal assertion below.
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    expect(verbs()).toEqual(["approved", "rejected"]);
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("still acts through the sealed bridge", async () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={task("access_request")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    // The third argument is the reason, empty when the verb does not require one. Passed
    // always rather than conditionally, so the bridge has one shape.
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "approved", "");
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
    expect(verbs()).toEqual([]);
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

/**
 * THE VERBS ARE THE DECLARATION'S, IN ITS ORDER.
 *
 * The interim table held five kinds. The deployment declares eight, six of them APPROVAL_TASK,
 * and cortex had never heard of the six `risk_acceptance_*` species — so every one drew "unknown
 * species here" with no buttons. Extending the table would not have fixed it either: a High
 * acceptance takes `accepted` and the gate REFUSES `approved`, because an approval says the
 * artifact is in order while an acceptance says a named authority is taking the residual risk.
 *
 * ── WHAT THESE SEALS CANNOT DISTINGUISH ───────────────────────────────────────────────────
 *
 * They cannot tell whether the gate would ACCEPT the verb pressed. They assert what the card
 * offers and posts, never what the server permits — the declaration is the only claim available
 * on this side, and trusting it is the point.
 *
 * They also cannot see the two-surface split (the task row versus the kinds endpoint). The card
 * is handed a declaration; where it came from is the caller's business.
 */
describe("the served declaration decides the verbs", () => {
  /** A High risk acceptance, exactly as the read path returns it. */
  const HIGH = {
    kind: "risk_acceptance_high",
    declared: true,
    archetype: "APPROVAL_TASK",
    badge: "ACCEPT",
    title: "Risk acceptance (high)",
    accepts: ["accepted", "rejected", "returned_for_rework"],
    reason_required: ["accepted"],
  };

  it("offers the declared verbs for a kind the interim table never knew", () => {
    // The whole point: this species was undecidable in cortex an hour ago.
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_high"), declaration: HIGH }} />);
    expect(verbs()).toEqual(["accepted", "rejected", "returned_for_rework"]);
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
  });

  it("offers `accepted` and NOT the generic `approved`", () => {
    // The gate refuses `approved` for this species, so a card offering it offers a verb nobody
    // can submit — and the label must show the word being archived.
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_high"), declaration: HIGH }} />);
    expect(verbs()).toContain("accepted");
    expect(verbs()).not.toContain("approved");
  });

  it("keeps the DECLARATION's order, never sorted", () => {
    // Asserted on a declared order that is NOT alphabetical — otherwise a sort passes the test.
    const shuffled = { ...HIGH, accepts: ["returned_for_rework", "accepted", "rejected"] };
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_high"), declaration: shuffled }} />);
    expect(verbs()).toEqual(["returned_for_rework", "accepted", "rejected"]);
  });

  it("posts the declared verb, with the reason", () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={{ ...task("risk_acceptance_high"), declaration: HIGH }} />);
    fireEvent.change(document.querySelector("[data-reason-input]")!, {
      target: { value: "residual accepted by CE" },
    });
    fireEvent.click(document.querySelector('[data-verb="accepted"]')!);
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "accepted", "residual accepted by CE");
  });
});

describe("a reason-required verb is not submitted without one", () => {
  const DISMISS = {
    kind: "hazard_link_review",
    declared: true,
    archetype: "GROUPED_REVIEW",
    badge: "LINK",
    title: "Hazard link review",
    accepts: ["linked", "new_hazard", "dismissed"],
    reason_required: ["dismissed", "new_hazard"],
  };

  /*
   * WHICH GUARD THIS TEST ACTUALLY EXERCISES, because there are two and they are not equal.
   *
   * The button carries `disabled`, and a disabled button never fires its handler — so this
   * asserts the DISABLED STATE, and the guard inside `act()` is unreachable from the UI. A
   * mutation deleting that guard survives, and it is redundancy rather than blindness: it is
   * the thing that still refuses if anyone later removes `disabled`, or calls the handler
   * programmatically. Both kept; noted so a passing test here is not read as proof of the
   * second one.
   */
  it("BLOCKS the verb until a reason is given, and posts nothing", () => {
    // Dismissing a reported hazard with no stated rationale is the erasure this domain cares
    // about most. The gate refuses it; a card that posted anyway would turn a declared
    // requirement into a server error the reader cannot act on.
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: DISMISS }} />);
    fireEvent.click(document.querySelector('[data-verb="dismissed"]')!);
    expect(actOnHumanTask).not.toHaveBeenCalled();
  });

  it("allows it once a reason is typed", () => {
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: DISMISS }} />);
    fireEvent.change(document.querySelector("[data-reason-input]")!, {
      target: { value: "duplicate of H-114" },
    });
    fireEvent.click(document.querySelector('[data-verb="dismissed"]')!);
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "dismissed", "duplicate of H-114");
  });

  it("does NOT block a verb that requires no reason", () => {
    // The control. A card gating every verb on the reason field would satisfy the assertions
    // above while making `linked` unreachable.
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: DISMISS }} />);
    fireEvent.click(document.querySelector('[data-verb="linked"]')!);
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "linked", "");
  });

  it("offers NO reason field when no declared verb requires one", () => {
    // Otherwise every card grows an input nobody needs, and the field stops meaning anything.
    const noReason = { ...DISMISS, reason_required: [] as string[] };
    render(<ApprovalTaskCard task={{ ...task("hazard_link_review"), declaration: noReason }} />);
    expect(document.querySelector("[data-reason-input]")).toBeNull();
  });
});

describe("the two absences stay distinguishable", () => {
  it("DECLARED with no verbs says so — not 'unknown species'", () => {
    // Bare `risk_acceptance` is undeclared on purpose (the species are per authority level), but
    // a declared species accepting nothing is a different fact: the mesh has it, and it is not
    // decided on this surface. Different repairs, so different renderings.
    const empty = {
      kind: "something_declared",
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "X",
      title: "X",
      accepts: [] as string[],
      reason_required: [] as string[],
    };
    render(<ApprovalTaskCard task={{ ...task("something_declared"), declaration: empty }} />);
    expect(document.querySelector("[data-declared-no-verbs]")).not.toBeNull();
    expect(document.querySelector("[data-undeclared-kind]")).toBeNull();
    expect(verbs()).toEqual([]);
  });

  it("NOT DECLARED says unknown species, even with the field present", () => {
    const undeclared = {
      kind: "totally_made_up",
      declared: false,
      archetype: "",
      badge: "",
      title: "",
      accepts: [] as string[],
      reason_required: [] as string[],
    };
    render(<ApprovalTaskCard task={{ ...task("totally_made_up"), declaration: undeclared }} />);
    expect(document.querySelector("[data-undeclared-kind]")).not.toBeNull();
    expect(document.querySelector("[data-declared-no-verbs]")).toBeNull();
  });

  it("a MISSING declaration falls back to the interim table, not to 'undeclared'", () => {
    // The deploy window. No row carries a declaration until the read path rolls, and reading its
    // absence as "declares nothing" would strip the buttons off every task that works today.
    render(<ApprovalTaskCard task={task("pcn_disposition")} />);
    expect(verbs()).toEqual(["approved", "rejected"]);
    expect(document.querySelector("[data-declared-no-verbs]")).toBeNull();
  });
});

/**
 * THE READER REFUSES WHAT IT CANNOT TRUST, and two of these are the producer's own near-misses.
 *
 * Added because a mutation survey found the fixtures above could not reach them: every
 * declaration in them is well-formed, so the guards that matter were untested.
 */
describe("the declaration reader refuses a shape it cannot trust", () => {
  it("drops a reason_required verb that is NOT in accepts — the producer's first defect", () => {
    // Their read path's first version returned the kind-blind GLOBAL set, so bare
    // `risk_acceptance` came back `accepts: []` with `reason_required: ['accepted',
    // 'acknowledged']` — two verbs required to carry a reason on a species that accepts nothing.
    // Rendering that is a reason box for verbs nobody can submit.
    //
    // Re-applied on this side rather than trusted, because this reader is the thing that would
    // draw the field. Their own subset seal was green throughout: it reads the SOURCE and this
    // reads the PROJECTION, and an invariant true of a source is not automatically true of
    // every projection of it.
    const d = readTaskDeclaration({
      kind: "risk_acceptance",
      declared: true,
      accepts: [],
      reason_required: ["accepted", "acknowledged"],
    })!;
    expect(d.accepts).toEqual([]);
    expect([...d.reasonRequired]).toEqual([]);
  });

  it("keeps the reason_required verbs that ARE in accepts — the control", () => {
    // Without this, an intersection that returned nothing would pass the test above while
    // losing every legitimate requirement.
    const d = readTaskDeclaration({
      kind: "hazard_link_review",
      declared: true,
      accepts: ["linked", "new_hazard", "dismissed"],
      reason_required: ["dismissed", "new_hazard", "not_a_verb_here"],
    })!;
    expect([...d.reasonRequired].sort()).toEqual(["dismissed", "new_hazard"]);
  });

  it("REFUSES a declaration with no `declared` field rather than guessing", () => {
    // `declared` is the field that separates "the mesh has no such species" from "this species
    // decides nothing here". Guessing true claims a declaration nobody sent; guessing false
    // reports a species as unknown on the strength of a missing boolean. Null means "no
    // declaration to read", which is the honest third thing.
    expect(readTaskDeclaration({ kind: "x", accepts: ["approved"] })).toBeNull();
    expect(readTaskDeclaration({ kind: "x", declared: "yes", accepts: [] })).toBeNull();
  });

  it("REFUSES a declaration that cannot name its own species", () => {
    expect(readTaskDeclaration({ declared: true, accepts: ["approved"] })).toBeNull();
    expect(readTaskDeclaration({ kind: "   ", declared: true, accepts: [] })).toBeNull();
  });

  it("accepts a well-formed one — the positive control for all four refusals", () => {
    const d = readTaskDeclaration({
      kind: "risk_acceptance_high",
      declared: true,
      archetype: "APPROVAL_TASK",
      accepts: ["accepted", "rejected"],
      reason_required: ["accepted"],
    });
    expect(d).not.toBeNull();
    expect(d!.accepts).toEqual(["accepted", "rejected"]);
  });

  it("preserves accepts ORDER and drops duplicates", () => {
    const d = readTaskDeclaration({
      kind: "k",
      declared: true,
      accepts: ["returned_for_rework", "accepted", "returned_for_rework", ""],
    })!;
    expect(d.accepts).toEqual(["returned_for_rework", "accepted"]);
  });

  it("says nothing about a non-record", () => {
    for (const junk of [null, undefined, 42, "declared", []]) {
      expect(readTaskDeclaration(junk), String(junk)).toBeNull();
    }
  });
});

/**
 * CAPTURED FROM THE SERVING POD — `declaration_for(...)` on `cortex-bff`, fleet `a45a8dd`.
 *
 * The fixtures above were written from a spec in a message. These are what the deployment
 * actually returns, read in-process because `/task_kinds` requires auth over HTTP. Two things
 * differed from the spec and neither was in the description:
 *
 *   `archetype`, `badge`, `title` come back **null** for an undeclared kind — not absent, not
 *   empty string. The reader coerces them, and a reader that spread them into a template
 *   would have printed "null" into a badge.
 *
 *   `risk_acceptance_high` requires a reason for TWO verbs, not one. The single-verb fixture
 *   would still have passed every assertion, which is the ordinary way a fixture drifts from
 *   the payload it stands for.
 *
 * A fixture written from a description is a second-hand account of the wire. This file is the
 * wire.
 */
describe("the live declarations, captured", () => {
  const LIVE = {
    hazard_link_review: {
      kind: "hazard_link_review",
      declared: true,
      archetype: "GROUPED_REVIEW",
      badge: "LINK",
      title: "Hazard link review",
      accepts: ["linked", "new_hazard", "dismissed"],
      reason_required: ["dismissed", "new_hazard"],
    },
    risk_acceptance_high: {
      kind: "risk_acceptance_high",
      declared: true,
      archetype: "APPROVAL_TASK",
      badge: "ACCEPT-H",
      title: "High risk acceptance",
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
    risk_acceptance: {
      kind: "risk_acceptance",
      declared: false,
      archetype: null,
      badge: null,
      title: null,
      accepts: [],
      reason_required: [],
    },
  };

  it("renders the High acceptance's three verbs, in the declared order", () => {
    render(
      <ApprovalTaskCard
        task={{ ...task("risk_acceptance_high"), declaration: LIVE.risk_acceptance_high }}
      />,
    );
    expect(verbs()).toEqual(["accepted", "rejected", "returned_for_rework"]);
    expect(verbs()).not.toContain("approved");
  });

  it("requires a reason for BOTH verbs that declare one", () => {
    // The live row requires it for `accepted` AND `rejected`. A fixture with one would pass
    // every assertion while leaving the second unchecked.
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(
      <ApprovalTaskCard
        task={{ ...task("risk_acceptance_high"), declaration: LIVE.risk_acceptance_high }}
      />,
    );
    fireEvent.click(document.querySelector('[data-verb="rejected"]')!);
    expect(actOnHumanTask).not.toHaveBeenCalled();
    fireEvent.click(document.querySelector('[data-verb="returned_for_rework"]')!);
    expect(actOnHumanTask).toHaveBeenCalledWith("t1", "returned_for_rework", "");
  });

  it("draws NULL archetype/badge/title without printing them", () => {
    // They arrive as null rather than absent. A reader that spread them into a template would
    // put the word "null" in a badge.
    render(
      <ApprovalTaskCard task={{ ...task("risk_acceptance"), declaration: LIVE.risk_acceptance }} />,
    );
    expect(document.body.textContent).not.toContain("null");
    expect(document.querySelector("[data-undeclared-kind]")).not.toBeNull();
  });

  it("pcn_disposition is unchanged by the declaration arriving", () => {
    // The species that already worked through the interim table. Its declaration must produce
    // the same two buttons in the same order, or the read path is a regression for the one
    // kind that was fine.
    const { unmount } = render(<ApprovalTaskCard task={task("pcn_disposition")} />);
    const fallback = verbs();
    unmount();
    render(
      <ApprovalTaskCard
        task={{ ...task("pcn_disposition"), declaration: LIVE.pcn_disposition }}
      />,
    );
    expect(verbs()).toEqual(fallback);
    expect(document.querySelector("[data-reason-input]")).toBeNull();
  });

  it("the hazard review's declared order is NOT its sorted order — the non-degenerate case", () => {
    // Sorted is [dismissed, linked, new_hazard]; declared is [linked, new_hazard, dismissed].
    // Every deployed APPROVAL_TASK declaration is alphabetical by accident, so this is the only
    // live row on which a sorting card and an order-preserving card differ at all.
    const d = readTaskDeclaration(LIVE.hazard_link_review)!;
    expect(d.accepts).toEqual(["linked", "new_hazard", "dismissed"]);
    expect(d.accepts).not.toEqual([...d.accepts].sort());
  });

  it("every live declaration survives the reader", () => {
    // The floor. A reader that returned null for these would make every assertion above vacuous
    // by never rendering anything at all.
    for (const [name, raw] of Object.entries(LIVE)) {
      const d = readTaskDeclaration(raw);
      expect(d, name).not.toBeNull();
      expect(d!.kind, name).toBe(name);
    }
  });
});

/**
 * THE REFUSAL CARRIES THE MENU.
 *
 * `/act` answers a wrong verb with 422 and a body naming the verbs the species really takes,
 * in the declaration's order — `list(...)` and never `sorted(...)` on that side too. The shape
 * is captured from `gateway.py` in the serving pod:
 *
 *   422 {"detail": {"error": "invalid_decision_for_kind", "kind": ..., "allowed": [...],
 *                   "message": ...}}
 *
 * A toast reading "Action failed" threw that list away and left the reader guessing at exactly
 * the thing the server had just told them.
 *
 * ── A CORRECTION PATH, NOT A DISCOVERY PATH ───────────────────────────────────────────────
 *
 * The declaration is how the card learns its verbs. Probing to find them would mean posting
 * decisions nobody made on a surface that archives them, which is why this fires only when the
 * card's copy and the server disagree — a stale bundle, a declaration that moved under a
 * long-lived tab. The disagreement is itself the fact worth rendering.
 *
 * ── WHAT THIS SEAL CANNOT DISTINGUISH ─────────────────────────────────────────────────────
 *
 * It cannot tell a stale bundle from a declaration that changed mid-session — both produce the
 * same 422 and the same correction, and the repair for both is the same press. It also cannot
 * assert that nothing was written: it checks the card says so, and the claim that no record was
 * archived is the gateway's, made before any write.
 */
describe("a refused decision offers what the server accepts", () => {
  const refusal = (allowed: string[], message = "approved is not valid for this kind") =>
    Object.assign(new Error("Request failed with status code 422"), {
      response: {
        status: 422,
        data: {
          detail: {
            error: "invalid_decision_for_kind",
            kind: "risk_acceptance_high",
            allowed,
            message,
          },
        },
      },
    });

  it("ADOPTS the allowed verbs, in the order the server sent them", () => {
    actOnHumanTask.mockRejectedValue(
      refusal(["accepted", "rejected", "returned_for_rework"]),
    );
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    // The card offered the seed pair; the server says otherwise.
    expect(verbs()).toEqual(["approved", "rejected"]);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() =>
      expect(verbs()).toEqual(["accepted", "rejected", "returned_for_rework"]),
    );
  });

  it("keeps the SERVER's order, even when it is not sorted", () => {
    // Asserted on an order that is not alphabetical, so a sort cannot pass. Re-sorting here
    // reproduces one surface out the defect the ordering fix was cut to close.
    actOnHumanTask.mockRejectedValue(refusal(["returned_for_rework", "accepted", "rejected"]));
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() =>
      expect(verbs()).toEqual(["returned_for_rework", "accepted", "rejected"]),
    );
  });

  it("SAYS the buttons changed, and that nothing was recorded", () => {
    // A menu that silently rearranged itself after a press is worse than the refusal it is
    // reporting: the reader would not know whether their decision landed, and the next press
    // would be made blind.
    actOnHumanTask.mockRejectedValue(refusal(["accepted"]));
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => {
      const note = document.querySelector("[data-decision-corrected]")!;
      expect(note).not.toBeNull();
      expect(note.textContent).toMatch(/nothing was recorded/i);
      expect(note.textContent).toContain("approved is not valid for this kind");
    });
  });

  it("does NOT mark the task done — the decision did not land", () => {
    actOnHumanTask.mockRejectedValue(refusal(["accepted"]));
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => expect(document.querySelector("[data-decision-corrected]")).not.toBeNull())
      .then(() => {
        expect(markTaskResolvedByTaskId).not.toHaveBeenCalled();
        expect(verbs().length).toBeGreaterThan(0);
      });
  });

  it("falls back to a TOAST for a refusal that names no verbs", () => {
    // 403 and 404 are not menu problems and must not be rendered as one — a card that showed
    // "these are the decisions this task accepts" with an empty list would be inventing a menu
    // out of an authorization failure.
    actOnHumanTask.mockRejectedValue(
      Object.assign(new Error("403"), { response: { status: 403, data: {} } }),
    );
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => expect(toast.error).toHaveBeenCalled()).then(() => {
      expect(document.querySelector("[data-decision-corrected]")).toBeNull();
      expect(verbs()).toEqual(["approved", "rejected"]);
    });
  });

  it("ignores a 422 whose allowed list is empty or junk", () => {
    // An empty correction would blank the card's buttons and leave no way to act at all —
    // strictly worse than the toast it replaced.
    actOnHumanTask.mockRejectedValue(refusal([]));
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => expect(toast.error).toHaveBeenCalled()).then(() => {
      expect(verbs()).toEqual(["approved", "rejected"]);
    });
  });


  it("keys on the ERROR CODE, not on the presence of an allowed list", () => {
    // CONSTRUCTED, because no live response is non-degenerate here: the 403 branch returns
    // `not_authorized_to_act` with no `allowed`, so a check that merely looked for the FIELD
    // would pass against every real payload today and be wrong the first time another refusal
    // shape carries one. Same reason the parity seal needs a constructed control — the found
    // examples cannot tell the two implementations apart.
    //
    // The settled-task 409 is the realistic candidate: a teammate already resolved it, and a
    // future body naming that species' verbs would be reported here as "your decision was
    // refused, pick another" when the truth is that the task is gone.
    actOnHumanTask.mockRejectedValue(
      Object.assign(new Error("409"), {
        response: {
          status: 409,
          data: { detail: { error: "already_resolved", allowed: ["accepted", "rejected"] } },
        },
      }),
    );
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => expect(toast.error).toHaveBeenCalled()).then(() => {
      expect(document.querySelector("[data-decision-corrected]")).toBeNull();
      expect(verbs()).toEqual(["approved", "rejected"]);
    });
  });

  it("says NOTHING on a success — the control", () => {
    // Without this, a card that always drew the correction would satisfy every assertion above.
    actOnHumanTask.mockResolvedValue({ workflow_resumed: false });
    render(<ApprovalTaskCard task={task("workflow_ack")} />);
    fireEvent.click(document.querySelector('[data-verb="approved"]')!);
    return waitFor(() => expect(markTaskResolvedByTaskId).toHaveBeenCalled()).then(() => {
      expect(document.querySelector("[data-decision-corrected]")).toBeNull();
    });
  });
});
