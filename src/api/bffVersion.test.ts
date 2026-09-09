/**
 * THE CLASSIFICATION, TESTED WHERE IT HAPPENS.
 *
 * ── WHY THIS FILE EXISTS SEPARATELY ───────────────────────────────────────────────────────
 *
 * `BuildStamp.test.tsx` mocks `fetchBffVersion` and asserts the LABEL for each result kind. It
 * is a good test of the labels and it was no test at all of the thing that was broken: a
 * mutation survey put four mutations into this function — collapse every failure to
 * unreachable, drop the 404 case, invert the two, treat every status as a missing endpoint —
 * and ALL FOUR SURVIVED. The defect the user actually reported lives here, and the suite that
 * covered the feature could not see this function at all.
 *
 * That is the fixture standing in for the subject, landing on the one function that had the
 * bug. The cure is the same as every other time this week: make the subject produce the result,
 * which here means faking the TRANSPORT and letting the real classification run.
 *
 * ── THE DISTINCTION BEING PINNED ──────────────────────────────────────────────────────────
 *
 * A response — any response, any status — means the service SPOKE. Absence of one means the
 * request never landed. The BFF was up and serving picks while the header called it
 * unreachable, because a 404 on an endpoint that has not shipped yet took the same branch as a
 * dead socket. Opposite repairs: roll the backend, versus go and find out why it is down.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import axios from "axios";

/** The shape axios throws: `response` present iff the server answered. */
const httpError = (status: number) =>
  Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: {} },
  });

/** A request that never landed — DNS failure, connection refused, timeout, offline. */
const networkError = () =>
  Object.assign(new Error("Network Error"), { isAxiosError: true, request: {} });

const get = vi.fn();

beforeEach(() => {
  get.mockReset();
  vi.spyOn(axios, "create").mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    interceptors: { request: { use: vi.fn() }, response: { use: vi.fn() } },
  } as never);
  vi.resetModules();
});

afterEach(() => vi.restoreAllMocks());

/** Imported AFTER the axios stub is installed, so the module binds to it. */
const load = async () => (await import("./client")).fetchBffVersion;

describe("a response is an answer, whatever its status", () => {
  it("404 means the endpoint is not there — NOT that the service is down", () => {
    // The reported defect. The BFF was up and serving picks; it had simply not been rolled yet.
    return load().then(async (fetchBffVersion) => {
      get.mockRejectedValue(httpError(404));
      expect(await fetchBffVersion()).toEqual({ kind: "no_endpoint" });
    });
  });

  it("no response at all is the ONLY thing that means unreachable", async () => {
    const fetchBffVersion = await load();
    get.mockRejectedValue(networkError());
    expect(await fetchBffVersion()).toEqual({ kind: "unreachable" });
  });

  it("another status is neither, and carries the status", async () => {
    // 401 and 500 are different problems, and a caller that flattened them into "no endpoint"
    // would send somebody to roll a backend over an auth failure.
    const fetchBffVersion = await load();
    for (const status of [401, 403, 500, 503]) {
      get.mockRejectedValue(httpError(status));
      expect(await fetchBffVersion()).toEqual({ kind: "error", status });
    }
  });

  it("a plain throw with no shape is unreachable, not a silent success", async () => {
    // Whatever else went wrong, nothing came back — and an unshaped failure must not fall
    // through to a result that reads like an answer.
    const fetchBffVersion = await load();
    get.mockRejectedValue(new Error("boom"));
    expect(await fetchBffVersion()).toEqual({ kind: "unreachable" });
  });
});

describe("a success reports the build", () => {
  it("reads `self` and nothing else from the census", async () => {
    const fetchBffVersion = await load();
    get.mockResolvedValue({
      data: {
        self: { component: "cortex-bff", git_sha: "50649d9", repo: "invincible-agent" },
        services: [{ component: "engine-o", git_sha: "aaaa" }],
        unreachable: ["engine-x"],
      },
    });
    const r = await fetchBffVersion();
    expect(r).toEqual({ kind: "ok", version: { component: "cortex-bff", git_sha: "50649d9", repo: "invincible-agent" } });
  });

  it("an answer WITHOUT a self block is still an answer", async () => {
    // Reached, endpoint present, nothing reported. That is an unstamped build — a third state,
    // and folding it into `unreachable` would be the original defect from the other direction.
    const fetchBffVersion = await load();
    get.mockResolvedValue({ data: {} });
    expect(await fetchBffVersion()).toEqual({ kind: "ok", version: {} });
  });

  it("the four kinds are mutually exclusive — the property, not the spellings", async () => {
    const fetchBffVersion = await load();
    const kinds: string[] = [];
    get.mockResolvedValue({ data: { self: { git_sha: "abc" } } });
    kinds.push((await fetchBffVersion()).kind);
    get.mockRejectedValue(httpError(404));
    kinds.push((await fetchBffVersion()).kind);
    get.mockRejectedValue(httpError(500));
    kinds.push((await fetchBffVersion()).kind);
    get.mockRejectedValue(networkError());
    kinds.push((await fetchBffVersion()).kind);
    expect(new Set(kinds).size).toBe(4);
  });
});
