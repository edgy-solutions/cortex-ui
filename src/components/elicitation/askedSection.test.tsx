/**
 * THE OFFER IS COLLAPSED, NOT DELETED.
 *
 * The fold replaces the ask card with its answer — a menu you can no longer use, above its own
 * answer, is chrome that outlived its purpose. But that throws something away: a reader who
 * wants to know WHAT THEY WERE OFFERED has nowhere to look, and a ten-option list is exactly
 * where that matters. So it collapses to one line and unfolds on a tap.
 *
 * The size concern is the whole design constraint and is asserted directly: closed, this costs
 * ONE LINE and no options are in the DOM to take room.
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AskedSection } from "./AskedSection";
import { useCanvasStore } from "@/store/useCanvasStore";
import type { Artifact } from "@/api/types";

const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("@/hooks/useAgent", () => ({
  useAgent: () => ({
    sendMessage: (...args: unknown[]) => sent.calls.push(args),
    isProcessing: false,
    isConnected: true,
    isCheckingConnection: false,
    cancelStream: () => {},
    error: null,
  }),
}));

const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client: new QueryClient() }, children);

const OPTIONS = [
  { value: "C1", label: "Data Governance" },
  { value: "C4", label: "Inventory Visibility" },
  { value: "C8", label: "Analytics & Reporting" },
];

const askArtifact = (over: Record<string, unknown> = {}): Artifact =>
  ({
    id: "q1",
    status: "complete",
    created_at: 0,
    question_text: "what is the capability path",
    rendered_output: {
      components: [
        {
          archetype: "ELICITATION",
          disposition: "ask",
          status: "slot_elicitation",
          slot: "capability_id",
          options: OPTIONS,
          option_source: "enumeration",
          sub_query: "what is the capability path",
          accepted_slots: {},
          ...over,
        },
      ],
    },
  }) as unknown as Artifact;

const answer = (over: Partial<Artifact> = {}): Artifact =>
  ({
    id: "a1",
    status: "complete",
    created_at: 0,
    derived_from_artifact_id: "q1",
    answered_with: { slot: "capability_id", label: "Analytics & Reporting", value: "C8" },
    rendered_output: { components: [{ archetype: "PERIOD_SERIES" }] },
    ...over,
  }) as unknown as Artifact;

const seed = (arts: Artifact[]) =>
  useCanvasStore.setState({ artifacts: arts, currentArtifactId: "a1" });

const draw = (a: Artifact) => render(<AskedSection artifact={a} />, { wrapper });

beforeEach(() => {
  sent.calls = [];
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
});
afterEach(cleanup);

describe("closed, it costs one line", () => {
  it("shows what was chosen and how many were offered", () => {
    seed([askArtifact(), answer()]);
    draw(answer());
    const toggle = document.querySelector("[data-asked-toggle]")!;
    expect(toggle.textContent).toContain("capability:");
    expect(toggle.textContent).toContain("Analytics & Reporting");
    expect(toggle.textContent).toContain("C8");
    expect(toggle.textContent).toContain("3 offered");
  });

  it("puts NO options in the DOM until asked — the size constraint, asserted", () => {
    // The whole reason it collapses: a ten-option list must not take the room the grid needs.
    seed([askArtifact(), answer()]);
    draw(answer());
    expect(document.querySelectorAll("[data-asked-option]")).toHaveLength(0);
    expect(document.querySelector("[data-asked-options]")).toBeNull();
  });

  it("reads the slot WITHOUT its `_id` suffix", () => {
    seed([askArtifact(), answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-toggle]")!.textContent).not.toContain("capability_id");
  });
});

describe("open, the original offer is back exactly as it was", () => {
  it("unfolds every option and marks the one taken", () => {
    seed([askArtifact(), answer()]);
    draw(answer());
    fireEvent.click(document.querySelector("[data-asked-toggle]")!);
    expect(document.querySelectorAll("[data-asked-option]")).toHaveLength(3);
    expect(document.querySelector("[data-asked-chosen]")!.getAttribute("data-asked-option")).toBe("C8");
  });

  it("closes again on a second tap", () => {
    seed([askArtifact(), answer()]);
    draw(answer());
    const toggle = document.querySelector("[data-asked-toggle]")!;
    fireEvent.click(toggle);
    fireEvent.click(toggle);
    expect(document.querySelectorAll("[data-asked-option]")).toHaveLength(0);
  });
});

describe("picking again ADDS an answer — it does not replace one", () => {
  it("re-sends against the ASK's id, not this artifact's", () => {
    // That is what makes the new answer a sibling under the same question. Sending this
    // artifact's id would chain it off the answer and read as a follow-up.
    seed([askArtifact(), answer()]);
    draw(answer());
    fireEvent.click(document.querySelector("[data-asked-toggle]")!);
    fireEvent.click(screen.getByRole("button", { name: "Data Governance" }));

    expect(sent.calls).toHaveLength(1);
    const [query, boundSlots, , , answering] = sent.calls[0];
    expect(query).toBe("what is the capability path");
    expect(boundSlots).toEqual({ capability_id: "C1" });
    expect(answering).toBe("q1");
  });

  it("says plainly that the current answer stays", () => {
    // The alternative reading is that this undoes the answer below it.
    seed([askArtifact(), answer()]);
    draw(answer());
    fireEvent.click(document.querySelector("[data-asked-toggle]")!);
    expect(screen.getByText(/adds a second answer — this one stays/)).toBeTruthy();
  });

  it("re-picking the SAME option is allowed, not refused", () => {
    // Asking the same question again is a legitimate thing to want.
    seed([askArtifact(), answer()]);
    draw(answer());
    fireEvent.click(document.querySelector("[data-asked-toggle]")!);
    fireEvent.click(screen.getByRole("button", { name: "Analytics & Reporting" }));
    expect(sent.calls).toHaveLength(1);
  });
});

describe("it renders only where the lineage is real", () => {
  it("draws nothing on an ordinary answer", () => {
    seed([answer({ derived_from_artifact_id: null })]);
    draw(answer({ derived_from_artifact_id: null }));
    expect(document.querySelector("[data-asked-section]")).toBeNull();
  });

  it("draws nothing when the parent is not an ask", () => {
    // Ordinary follow-up lineage between two answers has no offer to show.
    seed([answer({ id: "q1", derived_from_artifact_id: null }), answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-section]")).toBeNull();
  });

  it("draws nothing when the parent has not synced yet", () => {
    seed([answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-section]")).toBeNull();
  });

  it("draws nothing for a MENULESS ask — there is no offer to reopen", () => {
    // A no-menu ask was answered in words. A section promising a set would open on nothing.
    seed([askArtifact({ options: [], option_source: "none", free_text_reason: "too_many" }), answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-section]")).toBeNull();
  });

  it("DOES draw for the real pair — the control on all four", () => {
    seed([askArtifact(), answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-section]")).toBeTruthy();
  });
});

describe("what was chosen survives a reload", () => {
  it("falls back to the SERVER's accepted slot when the client's record is gone", () => {
    // `answered_with` is what this browser sent and does not survive a reload;
    // `accepted_slots` is what the producer says reached the verb.
    seed([askArtifact(), answer()]);
    draw(
      answer({
        answered_with: null,
        resolved_intent: { accepted_slots: { capability_id: "C4" } },
      } as Partial<Artifact>),
    );
    const toggle = document.querySelector("[data-asked-toggle]")!;
    expect(toggle.textContent).toContain("Inventory Visibility");
    expect(toggle.textContent).toContain("C4");
  });
});

describe("the ask is found among its siblings, not assumed to be first", () => {
  it("reads the ELICITATION component even when another precedes it", () => {
    // A payload may carry more than one component, and the ask is not guaranteed to lead. A
    // gate that took the FIRST component would find a chart, fail to read it as an ask, and
    // silently render nothing — indistinguishable from "there was no ask".
    //
    // This is what makes the archetype check load-bearing rather than decorative: with a
    // single-component fixture, accepting anything is an equivalent mutation.
    const parent = askArtifact();
    (parent.rendered_output!.components as unknown[]).unshift({
      archetype: "PERIOD_SERIES",
      rows: [],
    });
    seed([parent, answer()]);
    draw(answer());
    expect(document.querySelector("[data-asked-section]")).toBeTruthy();
    expect(document.querySelector("[data-asked-toggle]")!.textContent).toContain("3 offered");
  });
});
