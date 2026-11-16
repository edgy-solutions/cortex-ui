/**
 * ONE PERSONA ON THE ROUTING PANEL (Chris, 2026-11-16).
 *
 * The order: "show one clearly labelled persona, not 'Acting as' and 'Voice' that disagree
 * without explanation". The panel showed two persona chips side by side: "Acting as" (the
 * caller, `acting.persona`) and "Voice" (the verb edge's `action.owner_persona`). They differ by
 * design (ADR-0009), but only a hover title said so.
 *
 * Sealed here:
 *   1. The face carries exactly one persona: the caller's, labelled "Acting as".
 *   2. The owner persona is no longer a chip. It appears only in the Action row's details,
 *      labelled "Verb owned by", and when it differs from the caller the hint names both.
 *   3. When the two agree, the hint does not invent a difference.
 *
 * The fixture's two personas DIFFER, which is the case the order is about. With equal values,
 * arm 1 could not tell which chip it counted.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import type { RouteDecision } from "@/api/types";

let current: RouteDecision | null = null;
vi.mock("@/store/useCanvasStore", () => ({
  useCurrentRouting: () => current,
}));

import { RoutingDecision } from "./RoutingDecision";

const CALLER = "DATA_ENGINEER";
const OWNER = "DATA_STEWARD";

function decision(owner: string, acting: string | null): RouteDecision {
  return {
    about: { label: "Catalog Asset", uri: "http://x/idp#Dataset", confidence: 0.94 },
    action: {
      label: "Look up ownership",
      iri: "mesh:lookupOwnership",
      confidence: 0.91,
      classify_called: true,
      candidate_count: 1,
      owner_persona: owner,
    },
    handled_by: { engine_name: "Engine A", provider: "engine_a", endpoint_url: "http://e/analyze" },
    ...(acting ? { acting: { persona: acting, domains: [] } } : {}),
  } as RouteDecision;
}

/** Every element whose OWN text (not a descendant's) is exactly `s`. */
function ownText(c: HTMLElement, s: string): Element[] {
  return Array.from(c.querySelectorAll("*")).filter(
    (e) => Array.from(e.childNodes).some((n) => n.nodeType === 3 && n.textContent?.trim() === s),
  );
}

beforeEach(() => {
  cleanup();
});

describe("routing panel: one persona", () => {
  it("1. the face shows the caller persona once, and no 'Voice' chip", () => {
    expect(CALLER).not.toBe(OWNER);
    current = decision(OWNER, CALLER);
    const { container: c } = render(<RoutingDecision />);
    expect(Array.from(c.querySelectorAll("[data-routing-persona]")).map((e) => e.getAttribute("data-routing-persona"))).toEqual([CALLER]);
    expect(ownText(c, "Acting as")).toHaveLength(1);
    expect(ownText(c, "Voice")).toHaveLength(0);
    expect(ownText(c, "answered by")).toHaveLength(0);
    // The owner persona is not on the face at all until the details open.
    expect(c.textContent).not.toContain(OWNER);
  });

  it("2. the owner persona is in the Action details, and the hint names both when they differ", () => {
    current = decision(OWNER, CALLER);
    const { container: c, getByText } = render(<RoutingDecision />);
    fireEvent.click(getByText("Look up ownership"));
    expect(ownText(c, "Verb owned by")).toHaveLength(1);
    expect(ownText(c, OWNER)).toHaveLength(1);
    expect(c.textContent).toContain(
      `(the persona that owns this verb. You asked as ${CALLER}; a caller may run a verb another persona owns, ADR-0009)`,
    );
  });

  it("3. when the two agree, the hint states no difference", () => {
    current = decision(OWNER, OWNER);
    const { container: c, getByText } = render(<RoutingDecision />);
    fireEvent.click(getByText("Look up ownership"));
    expect(c.textContent).toContain("(the persona that owns this verb, ADR-0009)");
    expect(c.textContent).not.toContain("You asked as");
  });
});
