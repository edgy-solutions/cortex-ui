import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

/**
 * `GET /askable_measures` carries the SAME cell the ask sends (both keys or neither), domains as a REPEATED key,
 * and a refusal the server said is a `refused` read with the served reason, never null and never an empty list.
 * The wire is axios's own serializer: the URL below is built by it from the captured request config.
 */
const h = vi.hoisted(() => ({
  seen: [] as unknown[],
  reply: { status: 200, data: {} as unknown } as { status: number; data: unknown },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const adapter: AxiosAdapter = async (config) => {
    h.seen.push(config);
    const res = { data: h.reply.data, status: h.reply.status, statusText: "", headers: {}, config };
    if (h.reply.status >= 400) {
      throw new mod.AxiosError("refused", String(h.reply.status), config, null, res);
    }
    return res;
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

import axios from "axios";
import { fetchAskableMeasures } from "./client";

const url = () => {
  const c = h.seen.at(-1) as InternalAxiosRequestConfig;
  return axios.getUri(c);
};

const served = (o: Record<string, unknown> = {}) => ({
  composed: true,
  invalid: [],
  measures: [],
  persona: "p",
  domains: ["a", "b"],
  cell_source: "picker",
  ...o,
});

beforeEach(() => {
  h.seen.length = 0;
  h.reply = { status: 200, data: served() };
});

describe("fetchAskableMeasures — the cell on the wire", () => {
  it("no cell: neither key is sent", async () => {
    await fetchAskableMeasures();
    expect(url()).not.toContain("active_persona");
    expect(url()).not.toContain("active_domains");
  });
  it("a cell: both keys, and the domains are a REPEATED key, not active_domains[]", async () => {
    await fetchAskableMeasures({ active_persona: "p", active_domains: ["a", "b"] });
    const u = url();
    expect(u).toContain("active_persona=p");
    expect(u).toContain("active_domains=a&active_domains=b");
    expect(u).not.toContain("%5B");
    expect(u).not.toContain("[");
  });
});

describe("fetchAskableMeasures — a served refusal", () => {
  it("400 with a string detail is drawn as refused, with the served words", async () => {
    h.reply = { status: 400, data: { detail: "active_persona and active_domains go together" } };
    const r = await fetchAskableMeasures({ active_persona: "p", active_domains: ["a"] });
    expect(r).toEqual({
      kind: "refused",
      refusal: { status: 400, code: null, reason: "active_persona and active_domains go together" },
    });
  });
  it("403 persona_not_held keeps its code and its reason", async () => {
    h.reply = { status: 403, data: { detail: { error: "persona_not_held", message: "You do not hold p." } } };
    const r = await fetchAskableMeasures({ active_persona: "p", active_domains: ["a"] });
    expect(r).toMatchObject({ kind: "refused", refusal: { status: 403, code: "persona_not_held", reason: "You do not hold p." } });
  });
  it("a response with no readable detail still says it was refused, not empty", async () => {
    h.reply = { status: 500, data: "boom" };
    const r = await fetchAskableMeasures();
    expect(r).toMatchObject({ kind: "refused", refusal: { status: 500 } });
  });
});
