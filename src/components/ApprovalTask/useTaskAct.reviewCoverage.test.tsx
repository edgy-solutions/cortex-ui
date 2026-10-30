/**
 * The act path carries `review_coverage` when given one (the promotion card gives it under the flag). The body is
 * captured at the real axios adapter, so what is checked is what would go on the wire, not an argument list.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen, fail } = vi.hoisted(() => ({
  seen: [] as InternalAxiosRequestConfig[],
  fail: { status: 0, data: undefined as unknown },
}));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    if (fail.status) {
      throw Object.assign(new Error(`Request failed with status code ${fail.status}`), {
        response: { status: fail.status, data: fail.data },
      });
    }
    return { data: { workflow_resumed: true }, status: 200, statusText: "OK", headers: {}, config };
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
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/lib/useTaskArtifactSync", () => ({ markTaskResolvedByTaskId: vi.fn() }));

import { useTaskAct } from "./useTaskAct";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import type { ReviewCoverageWire } from "@/lib/reviewCoverage";

const task: ApprovalTaskPayload = {
  task_id: "t-cov",
  kind: "document_promotion",
  task_state: "pending",
  title: "Promote",
  summary: "",
  audience: "document_promotion:SUSTAINMENT",
  requested_by: "svc:doc-tools",
  subject_ref: null,
};
const COVERAGE: ReviewCoverageWire = {
  rules_version: "cortex.reviewRuns.v1",
  looked_at: [0, 2],
  sampled: [2],
  flagged: [],
  groups: [{ rule: "same_shape_run", key: "FK9→FK9", parts: [1] }],
  shared: [],
  sample: { seed: "s", per_run: 2, sample_all_up_to: 4, min_run: 3 },
};
const sentBody = () => JSON.parse(String(seen[seen.length - 1].data)) as Record<string, unknown>;

beforeEach(() => {
  seen.length = 0;
  fail.status = 0;
  fail.data = undefined;
});

describe("act carries review_coverage only when given one", () => {
  it("a coverage is sent as review_coverage, deep-equal, beside the row edits", async () => {
    const { result } = renderHook(() => useTaskAct(task));
    const rowEdits = { deleted: [{ mpn: "A", reason: "r" }], added: [], corrected: [] };
    await act(async () => {
      await result.current.act("promoted", "ok", rowEdits, undefined, undefined, undefined, COVERAGE);
    });
    expect(seen).toHaveLength(1);
    expect(sentBody().review_coverage).toEqual(COVERAGE);
    expect(sentBody().row_edits).toEqual(rowEdits);
  });

  it("with no coverage the key is ABSENT, not null and not undefined-valued", async () => {
    const { result } = renderHook(() => useTaskAct(task));
    await act(async () => {
      await result.current.act("promoted", "ok");
    });
    expect(seen).toHaveLength(1);
    expect(Object.hasOwn(sentBody(), "review_coverage")).toBe(false);
    await act(async () => {
      await result.current.act("promoted", "ok", undefined, undefined, undefined, undefined, undefined);
    });
    expect(Object.hasOwn(sentBody(), "review_coverage")).toBe(false);
  });
});

describe("a refused coverage is read on the card", () => {
  it("422 review_coverage_invalid shows the server's message as the refusal", async () => {
    fail.status = 422;
    fail.data = { detail: { error: "review_coverage_invalid", check: "uncovered", message: "part 7 was neither opened nor grouped" } };
    const { result } = renderHook(() => useTaskAct(task));
    await act(async () => {
      await result.current.act("promoted", "ok", undefined, undefined, undefined, undefined, COVERAGE);
    });
    expect(result.current.refusal).toEqual({ message: "part 7 was neither opened nor grouped", code: "review_coverage_invalid" });
    expect(result.current.done).toBeNull();
  });
});

describe("buildActBody leaves the key out entirely (JSON.stringify would hide an undefined-valued one)", () => {
  it("absent without a coverage, present and identical with one", async () => {
    const { buildActBody } = await import("@/api/client");
    expect(Object.hasOwn(buildActBody("promoted", "c"), "review_coverage")).toBe(false);
    expect(Object.hasOwn(buildActBody("promoted", "c", undefined, undefined, undefined, undefined, undefined, undefined, undefined), "review_coverage")).toBe(false);
    expect(buildActBody("promoted", "c", undefined, undefined, undefined, undefined, undefined, undefined, COVERAGE).review_coverage).toBe(COVERAGE);
  });
});
