/**
 * THE FINANCE ROW ASKS "WHICH PROGRAM?" -- AS A CHOICE, NOT AS RED TEXT.
 *
 * A template with shared slots is offered, and its create goes through `POST /canvas/seed` with
 * the template id. The route answers an unbound slot with a 409 that can carry the ask (invincible-
 * agent #97, unmerged); the picker draws it as buttons, re-sends with the pick under the ask's
 * `binding_slot`, and composes the board from the ids the 200 returns. The transport is faked
 * UNDER the real axios pipeline, so the client's own 409 handling is in the loop.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, waitFor } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, serve } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  serve: [] as { status: number; data: unknown }[],
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const adapter: AxiosAdapter = async (config) => {
    seen.push(config);
    const next = serve.shift();
    if (!next) throw new Error("no response queued");
    const response = { data: next.data, status: next.status, statusText: "", headers: {}, config };
    if (next.status >= 400) {
      throw new mod.AxiosError("bad status", "ERR_BAD_REQUEST", config, null, response);
    }
    return response;
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = adapter;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

import { DockBar } from "./DockBar";
import { useStageStore } from "@/store/useStageStore";
import { useTemplateStore } from "@/store/useTemplateStore";
import { usePersonaStore } from "@/store/usePersonaStore";
import { POLICY_REFUSAL_DETAIL } from "@/lib/policyRefusalFixture";
import { readTemplateCatalog } from "@/lib/templateCatalog";
import {
  FINANCE_TEMPLATE_ID,
  SEED_409_ASK,
  SEED_409_ASK_UNAVAILABLE,
  SEED_409_NO_ASK,
  SEED_409_POLICY,
} from "@/lib/financeSeedAskFixture";

const FINANCE = {
  template_id: FINANCE_TEMPLATE_ID,
  title: "Program finance status",
  description: "Cost and schedule for one program",
  template_ref: "program_finance@a1b2c3d4e5f6",
  panels: 6,
  shared_slots: ["program"],
};

const body = (i: number) => JSON.parse(String(seen[i].data));
const form = () => document.querySelector("[data-template-picker]")!.parentElement!;

/** No colour of alarm anywhere in the form's subtree, in any arm. */
const noAlarmClasses = () => {
  const bad: string[] = [];
  for (const el of Array.from(form().querySelectorAll("[class]"))) {
    const m = (el.getAttribute("class") ?? "").match(/text-(rose|red|amber)-\S+/g);
    if (m) bad.push(...m);
  }
  expect(bad).toEqual([]);
};

beforeEach(() => {
  seen.length = 0;
  serve.length = 0;
  useStageStore.setState({ canvases: [], view: "global", focusId: null } as never);
  act(() => {
    useTemplateStore.setState({
      status: "loaded",
      catalog: readTemplateCatalog({ composed: true, templates: [FINANCE], unreadable: [] }),
    });
  });
});
afterEach(() => {
  cleanup();
  usePersonaStore.setState({ entitlements: null, selectedPersona: null, selectedDomains: [] } as never);
});

const chooseFinanceAndCreate = () => {
  render(<DockBar />);
  fireEvent.click(screen.getByText("New"));
  fireEvent.click(document.querySelector(`[data-template-option="${FINANCE_TEMPLATE_ID}"]`)!);
  fireEvent.click(screen.getByText("Create"));
};

describe("the finance row, through /canvas/seed", () => {
  it("a 409 with an ask draws ONE option; the pick re-sends it under binding_slot; a 200 composes the board", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    serve.push({ status: 200, data: { artifact_ids: ["f1", "f2", "f3", "f4", "f5", "f6"] } });
    chooseFinanceAndCreate();

    await waitFor(() => expect(document.querySelector("[data-refusal-choice]")).not.toBeNull());
    expect(body(0)).toEqual({ template_id: "program_finance" });
    const buttons = document.querySelectorAll("[data-refusal-choice] [data-ask-option]");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("data-ask-option")).toBe("NP-MERIDIAN");
    expect(useStageStore.getState().canvases).toHaveLength(0);
    noAlarmClasses();

    fireEvent.click(buttons[0]);
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));

    // BY HAND: the slot is `program` (binding_slot), NOT `program_id` (the ask's own slot).
    expect(body(1)).toEqual({ template_id: "program_finance", bindings: { program: "NP-MERIDIAN" } });
    const c = useStageStore.getState().canvases[0];
    expect(c.template_id).toBe("program_finance");
    expect(c.items.map((i) => i.id)).toEqual(["f1", "f2", "f3", "f4", "f5", "f6"]);
    // The form closed on success: no choice left on screen.
    expect(document.querySelector("[data-refusal-choice]")).toBeNull();
  });

  it("the post-pick re-send carries the caller's cell exactly as the first send and the chat path do", async () => {
    // The pick re-sends through the same run() as Create; this arm pins that the cell rides along.
    // DOCS is entitled but never on the menu: `inScope` adds it, as it does on every chat turn.
    act(() => {
      usePersonaStore.setState({
        entitlements: {
          cells: [
            { persona: "PROGRAM_FINANCE_ANALYST", domain: "PROGRAM_FINANCE" },
            { persona: "PROGRAM_FINANCE_ANALYST", domain: "DOCS" },
          ],
        } as never,
        selectedPersona: "PROGRAM_FINANCE_ANALYST",
        selectedDomains: ["PROGRAM_FINANCE"],
      });
    });
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    serve.push({ status: 200, data: { artifact_ids: ["f1"] } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector('[data-ask-option="NP-MERIDIAN"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ask-option="NP-MERIDIAN"]')!);
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));

    const cell = { active_persona: "PROGRAM_FINANCE_ANALYST", active_domains: ["PROGRAM_FINANCE", "DOCS"] };
    expect(body(0)).toEqual({ template_id: "program_finance", ...cell });
    expect(body(1)).toEqual({ template_id: "program_finance", bindings: { program: "NP-MERIDIAN" }, ...cell });
  });

  it("never reaches createCanvas: a 409 leaves no board behind", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-refusal-choice]")).not.toBeNull());
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("a second 409 asks again and keeps the first binding", async () => {
    const second = {
      ...SEED_409_ASK,
      ask: {
        ...SEED_409_ASK.ask,
        slot: "period_id",
        binding_slot: "period",
        options: [{ value: "FY26", label: "Fiscal 2026" }],
      },
    };
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    serve.push({ status: 409, data: { detail: second } });
    serve.push({ status: 200, data: { artifact_ids: ["f1"] } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector('[data-ask-option="NP-MERIDIAN"]')).not.toBeNull());
    fireEvent.click(document.querySelector('[data-ask-option="NP-MERIDIAN"]')!);
    await waitFor(() => expect(document.querySelector('[data-ask-option="FY26"]')).not.toBeNull());
    noAlarmClasses();
    fireEvent.click(document.querySelector('[data-ask-option="FY26"]')!);
    await waitFor(() => expect(useStageStore.getState().canvases).toHaveLength(1));
    expect(body(2).bindings).toEqual({ program: "NP-MERIDIAN", period: "FY26" });
  });

  it("(d) a 409 with no ask draws the server's text, quietly", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_NO_ASK } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-refusal-message]")).not.toBeNull());
    expect(document.querySelector("[data-refusal-message]")?.textContent).toBe(SEED_409_NO_ASK.message);
    expect(document.querySelector("[data-refusal-choice]")).toBeNull();
    noAlarmClasses();
  });

  it("(b) a policy refusal draws the policy's message and its repair", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_POLICY } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-refusal-message]")).not.toBeNull());
    expect(document.querySelector("[data-refusal-message]")?.textContent).toBe(
      SEED_409_POLICY.ask.policy.message,
    );
    expect(document.querySelector("[data-refusal-repair]")?.textContent).toBe("switch_cell");
    expect(document.querySelector("[data-refusal-choice]")).toBeNull();
    noAlarmClasses();
  });

  it("(c) ask_unavailable draws the plain message and a small token", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_ASK_UNAVAILABLE } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-refusal-message]")).not.toBeNull());
    expect(document.querySelector("[data-refusal-ask-unavailable]")?.getAttribute("data-refusal-ask-unavailable")).toBe(
      "TimeoutError",
    );
    noAlarmClasses();
  });

  it("a 403 WITH a policy envelope draws the notice in place of the fixed text", async () => {
    serve.push({ status: 403, data: { detail: POLICY_REFUSAL_DETAIL } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-policy-refusal]")).not.toBeNull());
    expect(document.querySelector("[data-policy-missing]")?.textContent).toBe("Missing: member(NP-MERIDIAN)");
    expect(document.body.textContent).not.toMatch(/did not complete/);
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("a 403 WITHOUT one keeps the fixed text exactly", async () => {
    serve.push({ status: 403, data: { detail: "forbidden" } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-create-blocked]")).not.toBeNull());
    expect(document.querySelector("[data-create-blocked]")?.textContent).toBe("The seed did not complete, so no board was created.");
    expect(document.querySelector("[data-policy-refusal]")).toBeNull();
  });

  it("any other failure uses the create-failure path and leaves no board", async () => {
    serve.push({ status: 500, data: { detail: "boom" } });
    chooseFinanceAndCreate();
    await waitFor(() => expect(document.querySelector("[data-create-blocked]")).not.toBeNull());
    expect(document.querySelector("[data-create-blocked]")?.textContent).toMatch(/no board was created/);
    expect(useStageStore.getState().canvases).toHaveLength(0);
  });

  it("the near side: a bindable row still creates locally with no request at all", () => {
    act(() => {
      useTemplateStore.setState({
        status: "loaded",
        catalog: readTemplateCatalog({
          composed: true,
          templates: [{ ...FINANCE, template_id: "portfolio_planning", title: "Portfolio", shared_slots: [] }],
          unreadable: [],
        }),
      });
    });
    render(<DockBar />);
    fireEvent.click(screen.getByText("New"));
    fireEvent.click(document.querySelector('[data-template-option="portfolio_planning"]')!);
    fireEvent.click(screen.getByText("Create"));
    expect(useStageStore.getState().canvases).toHaveLength(1);
    expect(seen).toHaveLength(0);
  });
});
