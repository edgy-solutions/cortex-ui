/**
 * THE ASK'S AFTER STATE — a menu that takes a click and looks unchanged reads as a menu that
 * did not take it.
 *
 * Walked under a person: nine options, one picked, and the card sat exactly as it had before.
 * Options still live, nothing marked, no line saying what was chosen. The only evidence the
 * answer went anywhere was the answer eventually arriving somewhere else, and the natural next
 * move for a reader is to click again — which issues a second turn against a question already
 * answered.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { AskCard } from "./AskCard";

afterEach(cleanup);

const card = (over: Record<string, unknown> = {}) => ({
  archetype: "ELICITATION",
  status: "slot_elicitation",
  disposition: "ask",
  verb_iri: "mesh:planCapabilityPath",
  sub_query: "what is the capability path",
  slot: "capability_id",
  reason: "slot-unfilled",
  spoken: "",
  found: "",
  options: [
    { value: "C4", label: "Inventory Visibility" },
    { value: "C1", label: "Data Governance" },
  ],
  option_source: "enumeration",
  free_text_reason: null,
  truncated_from: 0,
  total_count: 0,
  accepted_slots: {},
  message: "",
  ...over,
});

const noMenu = () =>
  card({ options: [], option_source: "none", free_text_reason: "too_many", total_count: 14 });

describe("a pick is acknowledged", () => {
  it("marks the chosen option and quiets the rest", () => {
    render(<AskCard component={card()} onReroute={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Inventory Visibility" }));

    const chosen = document.querySelector("[data-ask-chosen]")!;
    expect(chosen, "nothing marked as chosen").toBeTruthy();
    expect(chosen.getAttribute("data-ask-option")).toBe("C4");
    expect(chosen.textContent).toBe("Inventory Visibility");
  });

  it("says what was chosen, in the reader's words AND the id it stands for", () => {
    // `capability: Inventory Visibility → C4`. The slot is read WITHOUT its `_id` suffix — that
    // is a fact about a signature, and reading it back asks a person for an opaque key.
    render(<AskCard component={card()} onReroute={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Inventory Visibility" }));

    const line = document.querySelector("[data-ask-answered]")!;
    expect(line.textContent).toContain("capability:");
    expect(line.textContent).not.toContain("capability_id");
    expect(line.textContent).toContain("Inventory Visibility");
    expect(line.textContent).toContain("C4");
  });

  it("LOCKS — a second click cannot issue a second turn", () => {
    // The card has been answered. Re-picking would re-ask a question that already has an
    // answer in flight, and the reader would have no way to know which one they were getting.
    const onReroute = vi.fn();
    render(<AskCard component={card()} onReroute={onReroute} />);
    fireEvent.click(screen.getByRole("button", { name: "Inventory Visibility" }));
    fireEvent.click(screen.getByRole("button", { name: "Data Governance" }));
    fireEvent.click(screen.getByRole("button", { name: "Inventory Visibility" }));

    expect(onReroute).toHaveBeenCalledTimes(1);
    for (const b of document.querySelectorAll("[data-ask-option]")) {
      expect((b as HTMLButtonElement).disabled, `${b.textContent} still live`).toBe(true);
    }
  });

  it("says it is running while the turn is in flight, and stops when it is not", () => {
    const { rerender } = render(<AskCard component={card()} onReroute={vi.fn()} pending />);
    fireEvent.click(screen.getByRole("button", { name: "Inventory Visibility" }));
    expect(document.querySelector("[data-ask-running]")).toBeTruthy();

    rerender(<AskCard component={card()} onReroute={vi.fn()} pending={false} />);
    expect(document.querySelector("[data-ask-running]")).toBeNull();
    // And the receipt SURVIVES the turn ending — what was chosen is still true afterwards.
    expect(document.querySelector("[data-ask-answered]")).toBeTruthy();
  });
});

describe("typed words are acknowledged differently, because less is known", () => {
  it("shows the words with NO arrow — nothing has resolved them yet", () => {
    // The arrow asserts that what the reader said BECAME what the system used. For typed words
    // the resolver has not run, so there is no right-hand side; the same rule the
    // interpretation strip follows for a refused slot.
    render(<AskCard component={noMenu()} onReroute={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("answer: capability"), {
      target: { value: "Integration Platform" },
    });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    const line = document.querySelector("[data-ask-answered]")!;
    expect(line.textContent).toContain("Integration Platform");
    expect(line.textContent).not.toContain("→");
  });

  it("locks the field and the button too", () => {
    render(<AskCard component={noMenu()} onReroute={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("answer: capability"), { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    expect((screen.getByLabelText("answer: capability") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "answer" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("a refusal is not an answer", () => {
  it("does NOT lock when nothing was sent", () => {
    // The worst of both would be a card showing a choice as made while nothing carried it.
    // `resolveAsk` throws before the lock is set, which is why the lock is written after it.
    const onReroute = vi.fn();
    render(<AskCard component={noMenu()} onReroute={onReroute} />);
    fireEvent.click(screen.getByRole("button", { name: "answer" })); // empty → refused

    expect(onReroute).not.toHaveBeenCalled();
    expect(document.querySelector("[data-ask-answered]")).toBeNull();
    expect((screen.getByLabelText("answer: capability") as HTMLInputElement).disabled).toBe(false);
  });

  it("and a later real answer still works — the refusal did not wedge the card", () => {
    const onReroute = vi.fn();
    render(<AskCard component={noMenu()} onReroute={onReroute} />);
    fireEvent.click(screen.getByRole("button", { name: "answer" }));
    fireEvent.change(screen.getByLabelText("answer: capability"), { target: { value: "Atlas" } });
    fireEvent.click(screen.getByRole("button", { name: "answer" }));

    expect(onReroute).toHaveBeenCalledTimes(1);
    expect(document.querySelector("[data-ask-answered]")).toBeTruthy();
  });

  it("nothing is acknowledged before anything is answered", () => {
    // Positive control for every assertion above: the receipt must not be present at rest.
    render(<AskCard component={card()} onReroute={vi.fn()} />);
    expect(document.querySelector("[data-ask-answered]")).toBeNull();
    expect(document.querySelector("[data-ask-chosen]")).toBeNull();
  });
});
