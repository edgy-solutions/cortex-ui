import { describe, it, expect, vi } from "vitest";
import { compareBundle, checkBundleFreshness } from "@/lib/bundleFreshness";

const A = "aaaaaaa1111111";
const B = "bbbbbbb2222222";

describe("compareBundle", () => {
  it("equal shas are current", () => {
    expect(compareBundle(A, { git_sha: A })).toEqual({ kind: "current", sha: A });
  });
  it("differing shas are stale and name both", () => {
    expect(compareBundle(A, { git_sha: B })).toEqual({ kind: "stale", mine: A, served: B });
  });
  it("a bundle with no sha is undecidable", () => {
    expect(compareBundle(null, { git_sha: B }).kind).toBe("undecidable");
  });
  it.each([
    ["null git_sha", { git_sha: null }],
    ["placeholder git_sha", { git_sha: "unknown" }],
    ["an html string", "<html>"],
    ["null", null],
  ])("served %s is undecidable", (_n, served) => {
    expect(compareBundle(A, served).kind).toBe("undecidable");
  });
});

const respond = (init: { ok: boolean; status?: number; body: string }) =>
  vi.fn().mockResolvedValue({ ok: init.ok, status: init.status ?? 200, text: async () => init.body });

describe("checkBundleFreshness", () => {
  it("asks for exactly /version.json with no-store", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: A }) });
    await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(f).toHaveBeenCalledWith("/version.json", { cache: "no-store" });
    expect(f).toHaveBeenCalledTimes(1);
  });
  it("matching body is current", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: A }) });
    expect((await checkBundleFreshness(A, f as unknown as typeof fetch)).kind).toBe("current");
  });
  it("differing body is stale", async () => {
    const f = respond({ ok: true, body: JSON.stringify({ git_sha: B }) });
    expect(await checkBundleFreshness(A, f as unknown as typeof fetch)).toEqual({
      kind: "stale",
      mine: A,
      served: B,
    });
  });
  it("404 is undecidable and says 404", async () => {
    const f = respond({ ok: false, status: 404, body: "" });
    const r = await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(r.kind).toBe("undecidable");
    expect(r.kind === "undecidable" && r.reason).toContain("404");
  });
  it("a non-JSON 200 (vite index.html) is undecidable", async () => {
    const f = respond({ ok: true, body: "<!doctype html><html></html>" });
    expect((await checkBundleFreshness(A, f as unknown as typeof fetch)).kind).toBe("undecidable");
  });
  it("a rejecting fetch is undecidable and does not throw", async () => {
    const f = vi.fn().mockRejectedValue(new Error("offline"));
    const r = await checkBundleFreshness(A, f as unknown as typeof fetch);
    expect(r).toEqual({ kind: "undecidable", reason: "offline" });
  });
});
