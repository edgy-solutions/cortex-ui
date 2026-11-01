/**
 * THE NEW-CANVAS DIALOG: ONE SEED, HONEST PROGRESS, PANEL 0 FRAMED, COUNT = RENDERED.
 *
 * The seed runner is injected through `DockBar`'s `seedDeps`, so no transport is faked here;
 * arm 7 mounts the real stage on the board the dialog created. The progress events are the
 * PROPOSED wire (`seedProgress.ts`): the live route emits none, and arm 3 pins that the dialog
 * then claims no k.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import type { Artifact } from "@/api/types";

vi.mock("@/components/elicitation/AskedSection", () => ({ AskedSection: () => null }));
vi.mock("./AnswerBody", () => ({ AnswerBody: () => null }));
vi.mock("./CanvasPane", () => ({ CanvasPane: () => null }));
vi.mock("./PlanningChrome", () => ({ PlanningChrome: () => null }));
vi.mock("./CanvasExportButton", () => ({ CanvasExportButton: () => null }));
vi.mock("@/api/client", async (orig) => ({
  ...(await orig<object>()),
  fetchLineageEdges: vi.fn().mockResolvedValue([]),
  fetchCanvases: vi.fn().mockResolvedValue([]),
  saveCanvases: vi.fn().mockResolvedValue(undefined),
}));

import { DockBar } from "./DockBar";
import { GlobalCanvasStage } from "./GlobalCanvasStage";
import type { SeedRunner } from "./useTemplateSeed";
import { useStageStore } from "@/store/useStageStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useTemplateStore } from "@/store/useTemplateStore";
import { PLANNING_CHROME_INSET } from "./planningChromeMount";
import { readTemplateCatalog } from "@/lib/templateCatalog";
import { readSeedConflict } from "@/lib/askBearingRefusal";
import { FINANCE_TEMPLATE_ID, SEED_409_ASK } from "@/lib/financeSeedAskFixture";
import {
  PROPOSED_SEED_PROGRESS_FIXTURE,
  PROPOSED_SEED_PROGRESS_PARTIAL,
  type SeedPanelEvent,
} from "@/lib/seedProgress";

const FINANCE = {
  template_id: FINANCE_TEMPLATE_ID,
  title: "Program finance status",
  description: "Cost and schedule for one program",
  template_ref: "program_finance@a1b2c3d4e5f6",
  panels: 6,
  shared_slots: ["program"],
};
const IDS = PROPOSED_SEED_PROGRESS_FIXTURE.map((e) => e.artifact_id!);
const okResult = (ids: string[], total = 6) =>
  ({ ok: true, artifactIds: ids, seeded: ids.length, total }) as const;
type Ok = ReturnType<typeof okResult>;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const artifact = (id: string): Artifact =>
  ({
    id,
    status: "complete",
    created_at: 1_700_000_000_000,
    watermark: 0,
    question_text: `question ${id}`,
    summary: `summary ${id}`,
    rendered_output: { archetype: "MULTI_SERIES", components: [{ archetype: "MULTI_SERIES", rows: [] }] },
    routing: { about: { instance_resolved: false, label: "Program" } },
  }) as unknown as Artifact;

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 1600 });
  Object.defineProperty(HTMLElement.prototype, "clientHeight", { configurable: true, get: () => 900 });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: () => void;
      constructor(cb: () => void) {
        this.cb = cb;
      }
      observe() {
        this.cb();
      }
      disconnect() {}
      unobserve() {}
    },
  );
  useStageStore.setState({ canvases: [], view: "global", focusId: null, fullPane: false } as never);
  useCanvasStore.setState({ artifacts: IDS.map(artifact), currentArtifactId: null });
  act(() => {
    useTemplateStore.setState({
      status: "loaded",
      catalog: readTemplateCatalog({ composed: true, templates: [FINANCE], unreadable: [] }),
    });
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
});

const openAndPick = (runner: SeedRunner, templateId: string = FINANCE_TEMPLATE_ID) => {
  const utils = render(<DockBar seedDeps={{ seed: runner }} />);
  fireEvent.click(screen.getByText("New"));
  fireEvent.click(document.querySelector(`[data-template-option="${templateId}"]`)!);
  return utils;
};
const createBtn = () => document.querySelector("button svg.lucide-check")!.closest("button")!;
const q = (sel: string) => document.querySelector(sel);

describe("one seed", () => {
  it("a double Enter in one tick, then a Create click, make exactly ONE seed call", async () => {
    const d = deferred<Ok>();
    const runner = vi.fn<SeedRunner>(() => d.promise);
    openAndPick(runner);
    const input = document.querySelector("input")!;
    // Both inside one act: React state (`busy`) is stale between them, only the ref can stop it.
    act(() => {
      fireEvent.keyDown(input, { key: "Enter" });
      fireEvent.keyDown(input, { key: "Enter" });
    });
    fireEvent.click(createBtn());
    expect(runner).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve(okResult(IDS)));
  });

  it("a 409 ask: two quick clicks on the pick option re-send exactly once", async () => {
    const conflict = readSeedConflict({ response: { status: 409, data: { detail: SEED_409_ASK } } })!;
    const d = deferred<Ok>();
    const runner = vi
      .fn<SeedRunner>()
      .mockResolvedValueOnce({ ok: false, conflict })
      .mockImplementationOnce(() => d.promise);
    openAndPick(runner);
    fireEvent.click(createBtn());
    await waitFor(() => expect(q("[data-refusal-choice] [data-ask-option]")).not.toBeNull());
    const opt = q("[data-refusal-choice] [data-ask-option]")!;
    act(() => {
      fireEvent.click(opt);
      fireEvent.click(opt);
    });
    expect(runner).toHaveBeenCalledTimes(2);
    await act(async () => d.resolve(okResult(IDS)));
  });
});

describe("Seeding…", () => {
  it("the button, Cancel and the picker while a seed is pending", async () => {
    const d = deferred<Ok>();
    openAndPick(() => d.promise);
    fireEvent.click(createBtn());
    const btn = q("[data-create-seeding]") as HTMLButtonElement;
    expect(btn.textContent).toContain("Seeding…");
    expect(btn.disabled).toBe(true);
    expect((screen.getByText("Cancel") as HTMLButtonElement).disabled).toBe(true);
    expect(q("[data-template-picker]")).toBeNull();
    expect(q("input")).toBeNull();
    await act(async () => d.resolve(okResult(IDS)));
  });
});

describe("indeterminate", () => {
  it("a live-style runner (no onPanel) says how many were asked for and claims no k", async () => {
    const d = deferred<Ok>();
    openAndPick(() => d.promise);
    fireEvent.click(createBtn());
    const p = q("[data-seed-progress]")!;
    expect(p.getAttribute("data-seed-progress")).toBe("indeterminate");
    expect(p.textContent).toContain("Seeding 6 panels…");
    expect(q("[data-seed-panel]")).toBeNull();
    expect(document.body.textContent).not.toMatch(/\d+ of \d+/);
    await act(async () => d.resolve(okResult(IDS)));
  });
});

describe("counted", () => {
  it("after the third event it says 3 of 6, and a refused event changes nothing", async () => {
    const gates = PROPOSED_SEED_PROGRESS_FIXTURE.map(() => deferred<void>());
    const fin = deferred<Ok>();
    const runner: SeedRunner = async (_t, _b, _c, onPanel) => {
      for (let i = 0; i < 3; i++) {
        await gates[i].promise;
        onPanel(PROPOSED_SEED_PROGRESS_FIXTURE[i]);
      }
      // panel_index 9 of 6: the reader refuses it.
      await gates[3].promise;
      onPanel({ panel_index: 9, total: 6, outcome: "artifact" } as SeedPanelEvent);
      return fin.promise;
    };
    openAndPick(runner);
    fireEvent.click(createBtn());
    expect(q("[data-seed-progress]")!.getAttribute("data-seed-progress")).toBe("indeterminate");
    for (let i = 0; i < 3; i++) await act(async () => gates[i].resolve());
    const p = q("[data-seed-progress]")!;
    expect(p.getAttribute("data-seed-progress")).toBe("counted");
    expect(p.textContent).toContain("3 of 6 panels");
    expect(document.querySelectorAll('[data-seed-panel][data-state="seeded"]')).toHaveLength(3);
    expect(document.querySelectorAll('[data-seed-panel][data-state="pending"]')).toHaveLength(3);
    await act(async () => gates[3].resolve());
    expect(q("[data-seed-progress]")!.textContent).toContain("3 of 6 panels");
    expect(document.querySelectorAll("[data-seed-panel]")).toHaveLength(6);
    await act(async () => fin.resolve(okResult(IDS)));
  });
});

describe("completion", () => {
  it("a full seed closes the dialog and leaves a board of the six ids in order", async () => {
    openAndPick(async () => okResult(IDS));
    fireEvent.click(createBtn());
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    expect(q("[data-template-picker]")).toBeNull();
    expect(screen.queryByText("New canvas")).toBeNull();
    expect(useStageStore.getState().canvases[0].items.map((i) => i.id)).toEqual(IDS);
  });

  it("a partial seed keeps the dialog, names the refused panels, and Close closes", async () => {
    const runner: SeedRunner = async (_t, _b, _c, onPanel) => {
      PROPOSED_SEED_PROGRESS_PARTIAL.forEach(onPanel);
      return okResult(IDS.filter((_, i) => i !== 2 && i !== 4));
    };
    openAndPick(runner);
    fireEvent.click(createBtn());
    await waitFor(() => expect(q("[data-seed-partial]")).not.toBeNull());
    expect(q("[data-seed-partial]")!.textContent).toContain("4 of 6 panels seeded");
    const refused = Array.from(document.querySelectorAll('[data-seed-panel][data-state="refused"]'));
    expect(refused.map((r) => r.getAttribute("data-seed-panel"))).toEqual(["2", "4"]);
    // No path to a second seed from here.
    expect(screen.queryByText("Create")).toBeNull();
    expect(q("[data-template-picker]")).toBeNull();
    expect(screen.queryByText("Use (optional)")).toBeNull();
    fireEvent.click(screen.getByText("Close"));
    expect(screen.queryByText("New canvas")).toBeNull();
  });
});

describe("the count line is the rendered list", () => {
  /** Seed through the dialog, then unmount it and mount the REAL stage on the board it made. */
  const seedThenMountStage = async (ids: string[]) => {
    const dialog = openAndPick(async () => okResult(ids));
    const declared = Number(q("[data-template-panels]")!.textContent!.match(/\d+/)![0]);
    fireEvent.click(createBtn());
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    const partial = q("[data-seed-partial]")?.textContent ?? null;
    dialog.unmount();
    render(<GlobalCanvasStage />);
    return { declared, partial };
  };
  const cards = () => Array.from(document.querySelectorAll("[data-stage-card][data-answer-id]"));

  it("6 declared, 6 rendered, the same ids in order", async () => {
    const { declared } = await seedThenMountStage(IDS);
    expect(declared).toBe(6);
    expect(cards()).toHaveLength(6);
    expect(cards().map((c) => c.getAttribute("data-answer-id"))).toEqual(IDS);
  });

  it("a partial seed renders the 4 it got, and the dialog said 4 of 6", async () => {
    const four = IDS.slice(0, 4);
    const { partial } = await seedThenMountStage(four);
    expect(partial).toContain("4 of 6 panels seeded");
    expect(cards()).toHaveLength(4);
  });
});

describe("panel 0 is framed like the others", () => {
  it("every card carries a title band and panel 0's frame classes equal panel 1's", async () => {
    const dialog = openAndPick(async () => okResult(IDS));
    fireEvent.click(createBtn());
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    dialog.unmount();
    render(<GlobalCanvasStage />);
    const all = Array.from(document.querySelectorAll("[data-stage-card][data-answer-id]"));
    expect(all).toHaveLength(6);
    // THE FRONT FACE, NOT THE CARD: the back face also carries a band, so a card-wide query
    // stays green when the front one is lost.
    for (const c of all) {
      expect(c.querySelector('[data-face="front"] [data-stage-band]')).not.toBeNull();
    }
    const skin = (id: string) =>
      document
        .querySelector(`[data-answer-id="${id}"] [data-face="front"] > div`)!
        .getAttribute("class")!
        .split(/\s+/)
        .sort();
    expect(skin("fx-panel-0")).toEqual(skin("fx-panel-1"));
    expect(skin("fx-panel-0")).toContain("rounded-xl");
  });
});

describe("the camera clears the planning strip, on the stage as mounted", () => {
  /** The applied camera: the one element whose inline transform is translate(...) scale(...). */
  const camTy = () => {
    // Read the attribute: jsdom's CSSOM does not round-trip a compound transform via .style.
    const styles = Array.from(document.querySelectorAll("[style]")).map((e) => e.getAttribute("style")!);
    const m = styles
      .map((x) => x.match(/transform:\s*translate\([^,]+,\s*(-?[\d.]+)px\)\s*scale\(/))
      .find(Boolean);
    expect(m).toBeTruthy();
    return Number(m![1]);
  };
  const seedBoard = async () => {
    const dialog = openAndPick(async () => okResult(IDS));
    fireEvent.click(createBtn());
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    dialog.unmount();
  };

  it("a portfolio_planning board starts at or below the strip", async () => {
    await seedBoard();
    expect(useStageStore.getState().canvases[0].use).toBe("portfolio_planning");
    render(<GlobalCanvasStage />);
    expect(camTy()).toBeGreaterThanOrEqual(PLANNING_CHROME_INSET);
  });

  it("control: the same board under another lens gets no inset", async () => {
    await seedBoard();
    useStageStore.setState((z) => ({
      canvases: z.canvases.map((c) => ({ ...c, use: "aggregation" as const })),
    }));
    render(<GlobalCanvasStage />);
    expect(camTy()).toBeLessThan(PLANNING_CHROME_INSET);
  });
});

describe("the count line is read from the row, not assumed", () => {
  it("a 5-panel template: its count line says 5 and the stage renders 5", async () => {
    const FIVE = { ...FINANCE, template_id: "five_panel", title: "Five", panels: 5 };
    act(() => {
      useTemplateStore.setState({
        status: "loaded",
        catalog: readTemplateCatalog({ composed: true, templates: [FIVE], unreadable: [] }),
      });
    });
    const five = IDS.slice(0, 5);
    const dialog = openAndPick(async () => okResult(five, 5), "five_panel");
    const declared = Number(q("[data-template-panels]")!.textContent!.match(/\d+/)![0]);
    fireEvent.click(createBtn());
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    dialog.unmount();
    render(<GlobalCanvasStage />);
    const n = document.querySelectorAll("[data-stage-card][data-answer-id]").length;
    expect(declared).toBe(5);
    expect(n).toBe(declared);
  });
});
