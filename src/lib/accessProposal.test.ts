/**
 * The PROPOSED access wire: the readers, the fixtures, and the one client call (its request is not in the
 * BFF snapshot, so the request seal lists it as NOT_TRANSPORT and THIS file seals what it sends).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, reply, flag } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  reply: { data: {} as unknown },
  flag: { on: true },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: reply.data, status: 200, statusText: "OK", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});
vi.mock("@/lib/accessFlag", () => ({
  isAccessRequestsEnabled: () => flag.on,
  isAccessRequestsMockEnabled: () => false,
}));

import { fileAccessProposal } from "@/api/client";
import {
  PROPOSED_FIXTURE_GRANT_TASK,
  PROPOSED_FIXTURE_PROPOSAL,
  readAccessProposal,
  readGrantReviewTask,
} from "./accessProposal";

beforeEach(() => {
  seen.length = 0;
  flag.on = true;
});

describe("fileAccessProposal", () => {
  it("POSTs /access/proposals with exactly policy_id and missing_binding", async () => {
    reply.data = PROPOSED_FIXTURE_PROPOSAL;
    const r = await fileAccessProposal({ policy_id: "program_members", missing_binding: "member(NP-MERIDIAN)" });
    expect(r).toEqual(PROPOSED_FIXTURE_PROPOSAL);
    expect(seen).toHaveLength(1);
    expect(seen[0].method).toBe("post");
    expect(String(seen[0].url)).toMatch(/\/access\/proposals$/);
    expect(JSON.parse(String(seen[0].data))).toEqual({ policy_id: "program_members", missing_binding: "member(NP-MERIDIAN)" });
  });
  it("throws on a malformed response", async () => {
    reply.data = { proposal_id: "p" };
    await expect(fileAccessProposal({ policy_id: "a", missing_binding: "b" })).rejects.toThrow("malformed /access/proposals response");
  });
});

describe("readAccessProposal", () => {
  it("needs all three non-empty strings", () => {
    expect(readAccessProposal(PROPOSED_FIXTURE_PROPOSAL)).toEqual(PROPOSED_FIXTURE_PROPOSAL);
    expect(readAccessProposal({ ...PROPOSED_FIXTURE_PROPOSAL, review_task_id: "" })).toBeNull();
    expect(readAccessProposal(null)).toBeNull();
  });
});

describe("readGrantReviewTask", () => {
  const t = (over: Record<string, unknown> = {}) => ({ payload: { ...PROPOSED_FIXTURE_GRANT_TASK, ...over } });
  it("reads the fixture with the flag on", () => {
    const r = readGrantReviewTask(t());
    expect(r?.requester).toBe("bob");
    expect(r?.head_sha).toBe(PROPOSED_FIXTURE_PROPOSAL.head_sha);
    expect(r?.sync_state).toBeNull();
  });
  it("is null with the flag off", () => {
    flag.on = false;
    expect(readGrantReviewTask(t())).toBeNull();
  });
  it.each([
    ["review_shape", { review_shape: "document" }],
    ["short head_sha", { head_sha: "abc1234" }],
    ["non-hex head_sha", { head_sha: "z".repeat(40) }],
    ["requester", { requester: "" }],
    ["diff", { diff: undefined }],
    ["changes", { changes: [{ file: "f" }] }],
  ])("is null for a bad %s", (_n, over) => {
    expect(readGrantReviewTask(t(over))).toBeNull();
  });
  it("reads merge_sha and a known sync_state; ignores an unknown one", () => {
    expect(readGrantReviewTask(t({ merge_sha: "m".repeat(7), sync_state: "running" }))).toMatchObject({ merge_sha: "mmmmmmm", sync_state: "running" });
    expect(readGrantReviewTask(t({ sync_state: "weird" }))?.sync_state).toBeNull();
  });
});
