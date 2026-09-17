/**
 * THE PANEL REPORTS AND NEVER RENDERS.
 *
 * `available` — the values a refused slot WILL accept — was a correct field with NO reader
 * anywhere between the cost engine and this UI: zero in the dispatch chain, zero in the
 * presentation agent. Nothing failed, the refusal rendered as prose, and establishing why cost a
 * four-hop source trace across two repos. This panel makes that one line on screen.
 *
 * R-075 catches the producer — an enumeration in a message string is a field. Nothing caught the
 * other end, where a correct field sits unread indefinitely.
 */
import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnreadFields } from "./UnreadFields";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { Artifact } from "@/api/types";

const artifact = (components: unknown[]): Artifact =>
  ({
    id: "a1",
    status: "complete",
    rendered_output: { components },
  }) as unknown as Artifact;

const show = (components: unknown[]) => {
  useCanvasStore.setState({
    artifacts: [artifact(components)],
    currentArtifactId: "a1",
  } as never);
  render(<UnreadFields />);
};

beforeEach(() => useCanvasStore.setState({ artifacts: [], currentArtifactId: null } as never));
afterEach(cleanup);

describe("payload keys nothing read", () => {
  it("names the undeclared key", () => {
    show([{ archetype: "NAMED_HOLE", disposition: "unentitled", available: ["2022-02-01"] }]);
    const el = document.querySelector("[data-unread-fields]")!;
    expect(el).not.toBeNull();
    expect(el.textContent).toContain("available");
    expect(el.textContent).toContain("NAMED_HOLE");
  });

  it("⛔ NEVER PRINTS THE VALUE — the constraint, asserted on the rendered DOM", () => {
    // A key is a FINDING, not a value. An undeclared field has no units, no formatter and no
    // decided meaning; it may also carry what the classification does not permit here. So the
    // safe disclosure is that a key arrived.
    const secret = "COMMERCIALLY-SENSITIVE-9912";
    show([{ archetype: "NAMED_HOLE", disposition: "unentitled", unit_price: secret }]);
    const el = document.querySelector("[data-unread-fields]")!;
    expect(el.textContent).toContain("unit_price");
    expect(el.textContent).not.toContain(secret);
    // And not smuggled through an attribute either.
    expect(document.body.innerHTML).not.toContain(secret);
  });

  it("renders NOTHING when every key is declared — the control", () => {
    // Without this, a panel that always drew would pass the assertions above and put an
    // instrument banner on every answer in the system.
    show([{ archetype: "NAMED_HOLE", disposition: "unentitled", reason: "r" }]);
    expect(document.querySelector("[data-unread-fields]")).toBeNull();
  });

  it("renders nothing when there are no components at all", () => {
    show([]);
    expect(document.querySelector("[data-unread-fields]")).toBeNull();
  });

  it("reports UNMEASURABLE components rather than showing an empty panel", () => {
    // "Nothing unread" and "nothing could be checked" are different facts. A board of archetypes
    // this repo declares no contract for would otherwise render a blank panel that reads as a
    // clean result — the hollow green, in a control built to prevent one.
    show([{ archetype: "WORKFLOW_OBSERVATION", whatever: 1 }]);
    const el = document.querySelector("[data-unread-fields]")!;
    expect(el).not.toBeNull();
    expect(el.querySelector("[data-unread-unmeasured]")).not.toBeNull();
    expect(el.textContent).toMatch(/could not be checked/i);
  });

  it("lists several keys, sorted, and several components", () => {
    show([
      { archetype: "NAMED_HOLE", disposition: "d", zeta: 1, alpha: 2 },
      { archetype: "ELICITATION", slot: "s", extra_thing: 3 },
    ]);
    const rows = document.querySelectorAll("[data-unread-archetype]");
    expect(rows).toHaveLength(2);
    expect(rows[0].getAttribute("data-unread-keys")).toBe("alpha,zeta");
    expect(rows[1].getAttribute("data-unread-keys")).toBe("extra_thing");
  });
});
