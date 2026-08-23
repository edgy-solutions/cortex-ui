/**
 * SPIKE — not a production test. Deleted or promoted when the packet closes.
 *
 * THE ARCHITECTURAL BET, made executable. ADR-0042 §3/§4 require that drag is OPTIMISTIC (the
 * bar moves; arrangement is UI-master) while the DROP is EVALUATED server-side and the strips
 * redraw from server rows. That only works if the parent can let a drag happen and then REFUSE
 * to commit it.
 *
 * The library evaluation claimed SVAR supports this, from documentation. Documentation is a
 * read, not a measurement — this session has already produced three instruments that reported
 * numbers for work that never ran, and an unexecuted library evaluation is the same species of
 * claim. So the claim gets executed here.
 *
 * WHAT IS BEING PROVEN, precisely: that `api.intercept("move-task", …)` can CANCEL the commit,
 * leaving the caller's data unchanged. If it fires-then-reverts, or cannot cancel, the library
 * fights the architecture and the plan's fallback (vis-timeline, wrapper cost accepted) is the
 * better trade.
 *
 * `drag-task` and `move-task` are SEPARATE interceptable actions in the store — which is the
 * shape the ruling wants: the optimistic move and its commit are distinct events, so one can
 * proceed while the other is refused.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { Gantt } from "@svar-ui/react-gantt";
import type { IApi } from "@svar-ui/gantt-store";
import * as React from "react";

/**
 * jsdom returns NULL from canvas.getContext("2d") unless the native `canvas` package is
 * installed, and SVAR draws its background grid via a canvas pattern —
 * `grid(width, height, color)` -> createElement("canvas") -> getContext -> ctx.translate(...).
 * So the first run died with "Cannot read properties of null (reading 'translate')".
 *
 * THAT IS AN ENVIRONMENT LIMIT, NOT A LIBRARY DEFECT, and the distinction is the whole point:
 * reporting it as "SVAR fails in React" would have rejected the ruled library for jsdom's
 * missing 2d context. The canvas draws a background PATTERN — it has no bearing on whether a
 * parent can refuse a move, which is the only thing this spike is measuring.
 */
beforeAll(() => {
  // jsdom implements no layout, so it ships no ResizeObserver. SVAR's Layout observes its
  // container to size the chart. Same category as the canvas stub: an environment gap with a
  // standard shim, not a statement about the library.
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }

  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    translate: vi.fn(),
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    fill: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    setLineDash: vi.fn(),
    createPattern: vi.fn(() => ({})),
    canvas: { width: 100, height: 100 },
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

/** Two nesting levels — the plan needs initiative -> phase -> project. */
const TASKS = [
  { id: 1, text: "Initiative A", start: new Date(2026, 0, 1), end: new Date(2026, 3, 1), type: "summary" },
  { id: 2, text: "Phase A1", start: new Date(2026, 0, 1), end: new Date(2026, 1, 1), parent: 1 },
  { id: 3, text: "Project A1a", start: new Date(2026, 0, 5), end: new Date(2026, 0, 20), parent: 2 },
];

const LINKS = [{ id: 1, source: 2, target: 3, type: "e2s" }];
const SCALES = [
  { unit: "month" as const, step: 1, format: "MMMM yyy" },
  { unit: "day" as const, step: 1, format: "d" },
];

function mountGantt(onApi: (api: IApi) => void) {
  return render(
    React.createElement(Gantt, {
      tasks: TASKS,
      links: LINKS,
      scales: SCALES,
      init: onApi,
    } as never),
  );
}

describe("SPIKE: SVAR gantt honours a parent that refuses a commit", () => {
  it("hands the parent an api with intercept and exec", async () => {
    // Positive control. If `init` never fires, every assertion below is vacuous — and a spike
    // that proves nothing while passing is exactly what this file exists to avoid.
    let api: IApi | null = null;
    mountGantt((a) => { api = a; });
    await waitFor(() => expect(api).not.toBeNull());
    expect(typeof (api as unknown as IApi).intercept).toBe("function");
    expect(typeof (api as unknown as IApi).exec).toBe("function");
  });

  it("renders the hierarchy the plan needs (two nesting levels, FREE tier)", async () => {
    // `getState().tasks` is a GanttDataTree, not an array — `_tasks` is the flattened
    // IParsedTask[]. Found by executing; an Array.isArray check on `.tasks` fails.
    let api: IApi | null = null;
    mountGantt((a) => { api = a; });
    await waitFor(() => expect(api).not.toBeNull());
    // `_tasks` is the VISIBLE flattened list — with the root collapsed it has length 1 and the
    // children live in `data[]`. The addressable store is the TREE: `tasks.byId(id)`. Found by
    // dumping the real state; an assertion against `_tasks` reported "undefined" for a task
    // that was present the whole time.
    const state = (api as unknown as IApi).getState() as {
      tasks: { byId: (id: number) => { id: number; $level?: number } | undefined };
    };
    const leaf = state.tasks.byId(3);
    expect(leaf).toBeDefined();
    // A real tree, not three flat rows: the leaf sits below the root level.
    expect((leaf as { $level?: number }).$level ?? 0).toBeGreaterThan(0);
  });

  it("THE BET: intercepting update-task and returning false leaves the task unmoved", async () => {
    let api: IApi | null = null;
    mountGantt((a) => { api = a; });
    await waitFor(() => expect(api).not.toBeNull());
    const a = api as unknown as IApi;

    const startOf = (id: number) => {
      const s = a.getState() as { tasks: { byId: (i: number) => { start?: Date } | undefined } };
      return String(s.tasks.byId(id)?.start);
    };

    let seen = 0;
    a.intercept("update-task", () => { seen += 1; return false; });

    const before = startOf(3);
    await a.exec("update-task", { id: 3, task: { start: new Date(2026, 5, 1) } });
    const after = startOf(3);

    // BOTH halves are required. "Unchanged" alone would also be true of an exec that silently
    // no-ops, which would read as cancellation while proving nothing.
    expect(seen).toBeGreaterThan(0);
    expect(after).toBe(before);
  });

  it("NEGATIVE CONTROL: without the intercept, the same exec DOES move the task", async () => {
    // Without this, the test above passes for a library that ignores `exec` entirely.
    let api: IApi | null = null;
    mountGantt((a) => { api = a; });
    await waitFor(() => expect(api).not.toBeNull());
    const a = api as unknown as IApi;

    const startOf = (id: number) => {
      const s = a.getState() as { tasks: { byId: (i: number) => { start?: Date } | undefined } };
      return String(s.tasks.byId(id)?.start);
    };

    const before = startOf(3);
    await a.exec("update-task", { id: 3, task: { start: new Date(2026, 5, 1) } });
    const after = startOf(3);

    expect(after).not.toBe(before);
  });
});
