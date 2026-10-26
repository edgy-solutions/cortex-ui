/** `requestTemplateCanvasSeed` -- through the REAL axios pipeline, with the transport faked. */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { AxiosError, type AxiosAdapter, type InternalAxiosRequestConfig } from "axios";

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

import { requestTemplateCanvasSeed } from "./client";
import { SEED_409_ASK, SEED_409_NO_ASK } from "@/lib/financeSeedAskFixture";

beforeEach(() => {
  seen.length = 0;
  serve.length = 0;
});

const body = (i: number) => JSON.parse(String(seen[i].data));

describe("requestTemplateCanvasSeed", () => {
  it("a served 409 with an ask is a conflict, and the first body carries only the template id", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    const r = await requestTemplateCanvasSeed("program_finance");
    expect(seen[0].url).toBe("/canvas/seed");
    expect(body(0)).toEqual({ template_id: "program_finance" });
    expect(r.ok).toBe(false);
    if (r.ok || !("conflict" in r)) throw new Error("expected a conflict");
    expect(r.conflict.ask?.binding_slot).toBe("program");
  });

  it("the second call carries the binding under the ask's binding_slot, and a 200 is ok", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_ASK } });
    serve.push({ status: 200, data: { artifact_ids: ["a1", "a2", "a3"] } });
    const first = await requestTemplateCanvasSeed("program_finance");
    if (first.ok || !("conflict" in first)) throw new Error("expected a conflict");
    // BY HAND: the slot name and the picked value are spelled out, no helper builds the body.
    const second = await requestTemplateCanvasSeed("program_finance", { program: "NP-MERIDIAN" });
    expect(body(1)).toEqual({ template_id: "program_finance", bindings: { program: "NP-MERIDIAN" } });
    expect(second).toEqual({ ok: true, artifactIds: ["a1", "a2", "a3"] });
  });

  it("sends the cell when there is one, and nothing else", async () => {
    serve.push({ status: 200, data: { artifact_ids: ["a1"] } });
    await requestTemplateCanvasSeed("program_finance", undefined, {
      active_persona: "PROGRAM_FINANCE_ANALYST",
      active_domains: ["PROGRAM_FINANCE"],
    });
    expect(body(0)).toEqual({
      template_id: "program_finance",
      active_persona: "PROGRAM_FINANCE_ANALYST",
      active_domains: ["PROGRAM_FINANCE"],
    });
  });

  it("a pre-roll 409 with no ask is still a conflict, carrying only the message", async () => {
    serve.push({ status: 409, data: { detail: SEED_409_NO_ASK } });
    const r = await requestTemplateCanvasSeed("program_finance");
    if (r.ok || !("conflict" in r)) throw new Error("expected a conflict");
    expect(r.conflict.message).toBe(SEED_409_NO_ASK.message);
    expect("ask" in r.conflict).toBe(false);
  });

  it("any other failure is an error, not a conflict", async () => {
    serve.push({ status: 500, data: { detail: "boom" } });
    const r = await requestTemplateCanvasSeed("program_finance");
    expect(r.ok).toBe(false);
    expect("error" in r && r.error instanceof AxiosError).toBe(true);
    expect("conflict" in r).toBe(false);
  });

  it("drops non-string artifact ids", async () => {
    serve.push({ status: 200, data: { artifact_ids: ["a1", "", 3, null, "a2"] } });
    expect(await requestTemplateCanvasSeed("t")).toEqual({ ok: true, artifactIds: ["a1", "a2"] });
  });
});
