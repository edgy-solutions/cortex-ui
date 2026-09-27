/**
 * THE PICKER OFFERED A BOARD THAT CANNOT BE BUILT, AND DREW AN EMPTY ONE INSTEAD.
 *
 * A walk picked PROGRAM FINANCE STATUS from this menu and got an empty canvas. Nothing was
 * broken in the sense the symptom suggests: the template is ratified, parses, validates, and
 * says in its own header that it cannot seed — `shared_slots: [program]` is declared with
 * nothing binding it, the platform's seed route answers 409 for exactly that (R-005), and the
 * file ends *"Do not wire it into a seed path expecting cards."*
 *
 * ⛔ CORTEX NEVER SEES THAT 409, BECAUSE THE CREATE PATH IS LOCAL. So the refusal the producer
 * wrote down never reached a reader, and we drew a board of our own where the platform would
 * have refused and named the reason. The picker had two buckets — offerable, and *"cannot be
 * offered"* for a file that will not parse — and a ratified-but-unbindable template had nowhere
 * to land except among the boards on offer.
 *
 * ── WHY NO SEAL CAUGHT IT ─────────────────────────────────────────────────────────────────
 *
 * `sharedSlots` was read off the wire correctly and projected onto every row, and nothing
 * consumed it: the declaration, the assignment, and no reader. A correct field with no consumer
 * is invisible to every test of the projector, because the projector was right. This file is the
 * first seal on this menu's RENDERING — `canvasPicker.test.ts` beside it reads the source text
 * for the lens vocabulary, which cannot see which rows reach the screen.
 *
 * The derivation itself is sealed in `src/lib/templateCatalog.test.ts`. What is here is the
 * wiring: that the component asks, and that the answer changes what a reader can do.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, act } from "@testing-library/react";
import { DockBar } from "./DockBar";
import { useStageStore } from "@/store/useStageStore";
import { useTemplateStore } from "@/store/useTemplateStore";
import { readTemplateCatalog } from "@/lib/templateCatalog";

/** Producer-shaped, straight through the reader — see the note in templateCatalog.test.ts. */
const catalogOf = (...templates: Record<string, unknown>[]) =>
  readTemplateCatalog({ composed: true, templates, unreadable: [] });

const FINANCE = {
  template_id: "program_finance",
  title: "Program finance status",
  description: "Cost and schedule for one program",
  template_ref: "program_finance@a1b2c3d4e5f6",
  panels: 6,
  shared_slots: ["program"],
};
const PORTFOLIO = {
  template_id: "portfolio_planning",
  title: "Portfolio planning",
  description: "Every program at once",
  template_ref: "portfolio_planning@0f0f0f0f0f0f",
  panels: 4,
  shared_slots: [],
};

/**
 * `status: "loaded"` also stops `load()` reaching the network — it returns early when loaded.
 *
 * Wrapped in `act` because a store write that arrives MID-TEST has to reach the mounted
 * component before the next click: `submitCreate` closes over the catalog from its render, so an
 * unflushed write leaves the click judging the menu as it was. Without this the stale-selection
 * arm went red for the wrong reason — the create succeeded because the component never saw the
 * new catalog, which is the instrument failing and not the guard.
 */
const withCatalog = (...templates: Record<string, unknown>[]) =>
  act(() => {
    useTemplateStore.setState({ status: "loaded", catalog: catalogOf(...templates) });
  });

beforeEach(() => {
  useStageStore.setState({ canvases: [], view: "global", focusId: null } as never);
  withCatalog(PORTFOLIO, FINANCE);
});
afterEach(cleanup);

const openForm = () => {
  render(<DockBar />);
  fireEvent.click(screen.getByText("New"));
};

const offered = () =>
  Array.from(document.querySelectorAll("[data-template-option]"))
    .map((el) => el.getAttribute("data-template-option"))
    .filter((v) => v !== "");

/**
 * Clicked by ATTRIBUTE, never by text, and the first draft of this file learned why the hard way:
 * `getByText("Portfolio planning")` matched two elements. The lens `portfolio_planning` and the
 * template registry's legacy alias are the same string, so the label appears once in the lens row
 * and once in the template row — the exact collision `canvasPicker.test.ts` was written about. A
 * text query here would be ambiguous today and silently wrong the day one of them moved.
 */
const pick = (templateId: string) => {
  const el = document.querySelector(`[data-template-option="${templateId}"]`);
  if (!el) throw new Error(`no template option for ${templateId || "(none)"}`);
  fireEvent.click(el);
};

describe("a template that needs a binding is named, not offered", () => {
  it("keeps it out of the offer buttons and leaves the bindable one there", () => {
    openForm();
    // Both assertions in one arm on purpose: "finance is absent" passes just as well when the
    // whole menu is empty, which is the mistake a stricter predicate would make.
    expect(offered()).toEqual(["portfolio_planning"]);
  });

  it("says what it is and what it is waiting for, in the producer's terms", () => {
    openForm();
    const named = document.querySelector("[data-template-unbound]");
    expect(named?.textContent).toContain("Program finance status");
    expect(named?.textContent).toContain("ratified, needs a binding");
    // The slot is the whole point. Without it the reader is told to bind something unnamed.
    expect(named?.textContent).toContain("program");
  });

  it("draws NOTHING in that bucket when every template can be bound", () => {
    // The near side. A bucket that renders unconditionally would put an empty amber line under
    // a healthy menu, and a reader learns to ignore a line that is always there.
    withCatalog(PORTFOLIO);
    openForm();
    expect(document.querySelector("[data-template-unbound]")).toBeNull();
    expect(offered()).toEqual(["portfolio_planning"]);
  });
});

describe("an unbindable template cannot create a canvas", () => {
  it("still creates a board from a template that CAN be bound", () => {
    // The load-bearing near side: if this goes red the picker has stopped working entirely,
    // which is a worse defect than the empty board it was written to prevent.
    openForm();
    pick("portfolio_planning");
    fireEvent.click(screen.getByText("Create"));
    const canvases = useStageStore.getState().canvases;
    expect(canvases).toHaveLength(1);
    expect(canvases[0].template_id).toBe("portfolio_planning");
    expect(document.querySelector("[data-create-blocked]")).toBeNull();
  });

  it("refuses a selection that outlived the menu it was made from, and says so", () => {
    /*
      THE ONLY WAY A REFUSAL IS REACHABLE THROUGH THE UI, AND IT IS A REAL PATH.

      The unbindable template has no button, so a reader cannot pick it. What they CAN do is pick
      a board while it is offerable and submit after the registry has moved — Cancel does not
      clear the selection, so it outlives the form it was made in. Here the row grows a shared
      slot between the pick and the click, which is the same shape as a re-read registry.
    */
    openForm();
    pick("portfolio_planning");
    withCatalog({ ...PORTFOLIO, shared_slots: ["program"] }, FINANCE);
    fireEvent.click(screen.getByText("Create"));

    expect(useStageStore.getState().canvases).toHaveLength(0);
    const said = document.querySelector("[data-create-blocked]");
    expect(said?.textContent).toMatch(/needs a binding for program/);
    // AND THE FORM STAYS OPEN. A refusal that closes the form leaves the reader with a dialog
    // that vanished and no board, which reads as a create that worked.
    expect(document.querySelector("[data-template-picker]")).not.toBeNull();
  });

  it("clears a refusal when the reader picks again, rather than leaving it to be re-read", () => {
    openForm();
    pick("portfolio_planning");
    withCatalog({ ...PORTFOLIO, shared_slots: ["program"] }, FINANCE);
    fireEvent.click(screen.getByText("Create"));
    expect(document.querySelector("[data-create-blocked]")).not.toBeNull();
    // "None" is a pick too, and it is the one a stuck reader reaches for.
    pick("");
    expect(document.querySelector("[data-create-blocked]")).toBeNull();
  });

  it("does not carry a refusal into the next form after a create that worked", () => {
    /*
      FOUND BY A MUTANT THAT SURVIVED. Removing the clear on the SUCCESS path left every arm
      green, because the form closes on success and a message nobody can see is a message nobody
      asserted. Reopening is what makes it visible: the refusal outlives the create it refused,
      and a fresh form then says no board was created while one was.

      The path is the registry moving back: refused because the row grew a slot, allowed again
      once it is re-read without one, with no pick in between to clear anything.
    */
    openForm();
    pick("portfolio_planning");
    withCatalog({ ...PORTFOLIO, shared_slots: ["program"] }, FINANCE);
    fireEvent.click(screen.getByText("Create"));
    expect(document.querySelector("[data-create-blocked]")).not.toBeNull();

    withCatalog(PORTFOLIO, FINANCE);
    fireEvent.click(screen.getByText("Create"));
    expect(useStageStore.getState().canvases).toHaveLength(1);

    fireEvent.click(screen.getByText("New")); // reopen: this is where a stale one shows
    expect(document.querySelector("[data-create-blocked]")).toBeNull();
  });

  it("a freeform board is unaffected by any of this", () => {
    // Nothing above may cost a reader the plain case. With no template picked the guard must be
    // silent even while an unbindable template sits in the menu.
    openForm();
    fireEvent.click(screen.getByText("Create"));
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(useStageStore.getState().canvases[0].template_id).toBeUndefined();
  });
});
