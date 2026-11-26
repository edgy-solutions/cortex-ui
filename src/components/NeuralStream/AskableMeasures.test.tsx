import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { AskableRead, AskableRow } from "@/lib/askableMeasures";

vi.mock("@/api/client", () => ({ fetchAskableMeasures: vi.fn() }));

import { fetchAskableMeasures } from "@/api/client";
import { AskableTrigger } from "./AskableMeasures";
import { usePersonaStore } from "@/store/usePersonaStore";

const mock = vi.mocked(fetchAskableMeasures);
const R = (o: Partial<AskableRow> = {}): AskableRow => ({
  verb: "v", name: "Row", description: "Desc", phrasings: [], shape: null, unit: null, exampleAsk: null, groupLabel: null, ...o,
});
const ready = (rows: AskableRow[], extra: Partial<Extract<AskableRead, { kind: "ready" }>> = {}): AskableRead => ({
  kind: "ready", rows, unreadableRows: 0, invalid: [], cell: { persona: "P", domains: ["D"], cellSource: "picker" }, ...extra,
});

let qc: QueryClient;
let sendAsk: ReturnType<typeof vi.fn>;
const mount = () =>
  render(
    <QueryClientProvider client={qc}>
      <AskableTrigger sendAsk={sendAsk as never} />
    </QueryClientProvider>,
  );
const open = () => fireEvent.click(document.querySelector("[data-askable-trigger]")!);
const state = () => document.querySelector("[data-askable-state]");

beforeEach(() => {
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mock.mockReset();
  sendAsk = vi.fn(() => true);
  // A LOADED matrix with no cells: the ask is ready, with no cell.
  usePersonaStore.setState({ entitlements: { user_id: "u", source: "topaz", default: null, cells: [] }, entitlementsError: null, entitlementsLoading: false, selectedPersona: null, selectedDomains: [] } as never);
});
afterEach(() => {
  cleanup();
  usePersonaStore.setState({ ownerSub: null, entitlements: null } as never);
  vi.unstubAllGlobals();
});

describe("states", () => {
  it("loading", () => {
    mock.mockReturnValue(new Promise(() => {}));
    mount();
    open();
    expect(state()?.getAttribute("data-askable-state")).toBe("loading");
    expect(screen.getByText("Loading…")).toBeTruthy();
  });
  it("unreachable, and Retry refetches", async () => {
    mock.mockResolvedValue(null);
    mount();
    open();
    await screen.findByText("Can't load what you can ask.");
    expect(state()?.getAttribute("data-askable-state")).toBe("unreachable");
    fireEvent.click(document.querySelector("[data-askable-retry]")!);
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });
  it("unreadable", async () => {
    mock.mockResolvedValue({ kind: "unreadable" });
    mount();
    open();
    await screen.findByText("The list came back in a shape cortex can't read.");
    expect(state()?.getAttribute("data-askable-state")).toBe("unreadable");
  });
  it("not-composed", async () => {
    mock.mockResolvedValue({ kind: "not-composed", invalid: [] });
    mount();
    open();
    await screen.findByText("No list is configured on this deployment.");
    expect(state()?.getAttribute("data-askable-state")).toBe("not-composed");
  });
  it("empty", async () => {
    mock.mockResolvedValue(ready([]));
    mount();
    open();
    await screen.findByText("Nothing is declared for your access.");
    expect(state()?.getAttribute("data-askable-state")).toBe("empty");
  });
  it("ready", async () => {
    mock.mockResolvedValue(ready([R()]));
    mount();
    open();
    await screen.findByText("Row");
    expect(state()?.getAttribute("data-askable-state")).toBe("ready");
  });
});

describe("rows", () => {
  it("Ask SENDS the pick (name as label, verb, empty bindings) and closes the panel", async () => {
    mock.mockResolvedValue(ready([R({ verb: "vv", name: "Row", exampleAsk: "Why is X?" })]));
    mount();
    open();
    await screen.findByText("Row");
    expect(document.querySelector("[data-askable-example]")?.textContent).toBe('"Why is X?"');
    fireEvent.click(document.querySelector("[data-askable-ask]")!);
    expect(sendAsk).toHaveBeenCalledWith("Row", { verb: "vv", bindings: {} });
    expect(document.querySelector("[data-askable-panel]")).toBeNull();
  });
  it("a row without an example still has Ask, and no Copy link", async () => {
    mock.mockResolvedValue(ready([R()]));
    mount();
    open();
    await screen.findByText("Row");
    expect(document.querySelector("[data-askable-ask]")).not.toBeNull();
    expect(document.querySelector("[data-askable-copy]")).toBeNull();
    expect(document.querySelector("[data-askable-example]")).toBeNull();
  });
  it("a send that did not go says why and keeps the panel open", async () => {
    sendAsk.mockReturnValue({ notSent: "Your entitlements are still loading." } as never);
    mock.mockResolvedValue(ready([R()]));
    mount();
    open();
    await screen.findByText("Row");
    fireEvent.click(document.querySelector("[data-askable-ask]")!);
    expect(document.querySelector("[data-askable-notsent]")?.textContent).toBe("Your entitlements are still loading.");
    expect(document.querySelector("[data-askable-panel]")).not.toBeNull();
  });
  it("unit and shape tags only when served", async () => {
    mock.mockResolvedValue(ready([R({ verb: "a", name: "With", unit: "U!", shape: "S!" }), R({ verb: "b", name: "Without" })]));
    mount();
    open();
    await screen.findByText("With");
    expect(document.querySelectorAll("[data-askable-unit]").length).toBe(1);
    expect(document.querySelectorAll("[data-askable-shape]").length).toBe(1);
    expect(document.querySelector("[data-askable-unit]")?.textContent).toBe("U!");
    expect(document.querySelector("[data-askable-shape]")?.textContent).toBe("S!");
  });
  it("group heading only for a non-null label", async () => {
    mock.mockResolvedValue(ready([R({ verb: "a", name: "A1" }), R({ verb: "b", name: "B1", groupLabel: "Grp" })]));
    mount();
    open();
    await screen.findByText("A1");
    const h = document.querySelectorAll("[data-askable-group]");
    expect(h.length).toBe(1);
    expect(h[0].textContent).toBe("Grp");
  });
});

describe("search", () => {
  it("filters by a phrasing, and says when nothing matches", async () => {
    mock.mockResolvedValue(ready([R({ verb: "a", name: "One", phrasings: ["needle here"] }), R({ verb: "b", name: "Two" })]));
    mount();
    open();
    await screen.findByText("One");
    const input = document.querySelector("[data-askable-search]") as HTMLInputElement;
    expect(input.placeholder).toBe("Search what you can ask");
    fireEvent.change(input, { target: { value: "NEEDLE" } });
    expect(screen.queryByText("Two")).toBeNull();
    expect(screen.getByText("One")).toBeTruthy();
    fireEvent.change(input, { target: { value: "zzz" } });
    expect(document.querySelector("[data-askable-nomatch]")?.textContent).toBe("Nothing matches.");
  });
});

describe("footers", () => {
  it("invalid entries verbatim and the unreadable-rows line", async () => {
    mock.mockResolvedValue(ready([R()], { unreadableRows: 2, invalid: [{ source: "src-a", reason: "bad yaml" }] }));
    mount();
    open();
    await screen.findByText("Row");
    expect(document.querySelector("[data-askable-invalid]")?.textContent).toBe("src-a: bad yaml");
    const u = document.querySelector("[data-askable-unreadable-rows]");
    expect(u?.getAttribute("data-askable-unreadable-rows")).toBe("2");
    expect(u?.textContent).toBe("2 entries came back unreadable and are not shown.");
  });
  it("singular wording, and invalid shown for not-composed", async () => {
    mock.mockResolvedValue({ kind: "not-composed", invalid: [{ source: "s", reason: "r" }] });
    mount();
    open();
    await screen.findByText("No list is configured on this deployment.");
    expect(document.querySelector("[data-askable-invalid]")?.textContent).toBe("s: r");
  });
  it("one unreadable entry", async () => {
    mock.mockResolvedValue(ready([R()], { unreadableRows: 1 }));
    mount();
    open();
    await screen.findByText("Row");
    expect(document.querySelector("[data-askable-unreadable-rows]")?.textContent).toBe("1 entry came back unreadable and is not shown.");
  });
});

describe("two callers", () => {
  it("never share an entry", async () => {
    usePersonaStore.setState({ ownerSub: "sub-a" });
    mock.mockResolvedValueOnce(ready([R({ name: "Row A" })]));
    mount();
    open();
    await screen.findByText("Row A");
    open(); // close
    expect(document.querySelector("[data-askable-panel]")).toBeNull();
    mock.mockResolvedValueOnce(ready([R({ name: "Row B" })]));
    usePersonaStore.setState({ ownerSub: "sub-b" });
    open();
    await screen.findByText("Row B");
    expect(screen.queryByText("Row A")).toBeNull();
    expect(mock).toHaveBeenCalledTimes(2);
  });
});

describe("copy link", () => {
  it("writes origin + /ask?q= and shows Copied", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    mock.mockResolvedValue(ready([R({ exampleAsk: "What is A & B?" })]));
    mount();
    open();
    await screen.findByText("Row");
    fireEvent.click(document.querySelector("[data-askable-copy]")!);
    expect(writeText).toHaveBeenCalledWith(window.location.origin + "/ask?q=" + encodeURIComponent("What is A & B?"));
    await screen.findByText("Copied");
  });
  it("shows Copy failed when the write rejects", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    mock.mockResolvedValue(ready([R({ exampleAsk: "q" })]));
    mount();
    open();
    await screen.findByText("Row");
    fireEvent.click(document.querySelector("[data-askable-copy]")!);
    await screen.findByText("Copy failed");
  });
  it("shows Copy failed with no clipboard", async () => {
    vi.stubGlobal("navigator", {});
    mock.mockResolvedValue(ready([R({ exampleAsk: "q" })]));
    mount();
    open();
    await screen.findByText("Row");
    fireEvent.click(document.querySelector("[data-askable-copy]")!);
    await screen.findByText("Copy failed");
  });
});

describe("inside the ask bar's form", () => {
  it("Enter in the search box does not submit the form", async () => {
    mock.mockResolvedValue(ready([R({ name: "Row A" })]));
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <QueryClientProvider client={qc}>
        <form onSubmit={onSubmit}>
          <AskableTrigger sendAsk={sendAsk as never} />
        </form>
      </QueryClientProvider>,
    );
    open();
    await screen.findByText("Row A");
    const search = document.querySelector("[data-askable-search]")!;
    fireEvent.keyDown(search, { key: "Enter", code: "Enter" });
    fireEvent.submit(search.closest("form")!, {}); // control: the form CAN submit
    expect(onSubmit).toHaveBeenCalledTimes(1);
    onSubmit.mockClear();
    const ev = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    search.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });
});

describe("the cell the list is for", () => {
  const withCell = (persona: string, domain: string) =>
    usePersonaStore.setState({
      entitlements: { user_id: "u", source: "topaz", default: null, cells: [{ persona, domain }] },
      selectedPersona: persona,
      selectedDomains: [domain],
    } as never);
  it("names the served persona, domains and cell_source verbatim", async () => {
    mock.mockResolvedValue(ready([R()], { cell: { persona: "analyst", domains: ["MESH", "DOCS"], cellSource: "WhatEverServed" } }));
    mount();
    open();
    await screen.findByText("Row");
    const s = document.querySelector("[data-askable-scope]")!;
    expect(s.textContent).toContain("analyst · MESH · DOCS");
    expect(s.textContent).toContain("WhatEverServed");
    expect(s.getAttribute("data-askable-cell-source")).toBe("WhatEverServed");
  });
  it("a null persona says there is no access cell, and invents no persona word", async () => {
    mock.mockResolvedValue(ready([R()], { cell: { persona: null, domains: [], cellSource: "none" } }));
    mount();
    open();
    await screen.findByText("Row");
    expect(document.querySelector("[data-askable-scope]")?.textContent).toBe("You have no access cell.");
  });
  it("fetches with the SAME cell the ask resolves, and refetches on a persona switch", async () => {
    withCell("pa", "da");
    mock.mockResolvedValue(ready([R()]));
    mount();
    open();
    await screen.findByText("Row");
    expect(mock).toHaveBeenLastCalledWith({ active_persona: "pa", active_domains: ["da"] });
    withCell("pb", "db");
    await waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
    expect(mock).toHaveBeenLastCalledWith({ active_persona: "pb", active_domains: ["db"] });
  });
  it("no cell resolved: the list is fetched with none", async () => {
    mock.mockResolvedValue(ready([R()]));
    mount();
    open();
    await screen.findByText("Row");
    expect(mock).toHaveBeenLastCalledWith(undefined);
  });
  it("entitlements not loaded: no fetch, the readiness message is shown", async () => {
    usePersonaStore.setState({ entitlements: null, entitlementsError: null, entitlementsLoading: true } as never);
    mount();
    open();
    expect(document.querySelector("[data-askable-state]")?.getAttribute("data-askable-state")).toBe("not-ready");
    expect(screen.getByText(/still loading/)).toBeTruthy();
    expect(mock).not.toHaveBeenCalled();
  });
  it("a served refusal is drawn with the served reason, never an empty list", async () => {
    mock.mockResolvedValue({ kind: "refused", refusal: { status: 403, code: "persona_not_held", reason: "You do not hold that persona." } });
    mount();
    open();
    await screen.findByText("You do not hold that persona.");
    const s = document.querySelector("[data-askable-state]")!;
    expect(s.getAttribute("data-askable-state")).toBe("refused");
    expect(s.getAttribute("data-askable-refusal-code")).toBe("persona_not_held");
    expect(screen.queryByText("Nothing is declared for your access.")).toBeNull();
  });
});
