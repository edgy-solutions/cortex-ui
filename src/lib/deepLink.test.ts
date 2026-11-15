import { describe, it, expect, afterEach } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readDeepLink, deepLinkPath, returnToFor, safeReturnTo, signinArgs, afterSignin, idpHintFor } from "./deepLink";

describe("readDeepLink", () => {
  it("reads /case/<seg> with and without trailing slash, decoding the id", () => {
    expect(readDeepLink("/case/abc", "")).toEqual({ kind: "case", caseId: "abc" });
    expect(readDeepLink("/case/abc/", "?x=1")).toEqual({ kind: "case", caseId: "abc" });
    expect(readDeepLink("/case/a%3Ab~c", "")).toEqual({ kind: "case", caseId: "a:b~c" });
  });
  it("rejects bad case shapes", () => {
    for (const p of ["/case", "/case/", "/case/a/b", "/cases/x", "/Case/x", "/case/%E0%A4%A", "/case/%20", "/case/" + "a".repeat(513)]) {
      expect(readDeepLink(p, ""), p).toBeNull();
    }
    expect(readDeepLink("/case/" + "a".repeat(512), "")).not.toBeNull();
  });
  it("reads /ask?q= verbatim", () => {
    expect(readDeepLink("/ask", "?q=Why%20is%20X%3F")).toEqual({ kind: "ask", q: "Why is X?" });
    expect(readDeepLink("/ask/", "?q=%20hi%20")).toEqual({ kind: "ask", q: " hi " });
  });
  it("rejects bad ask shapes", () => {
    expect(readDeepLink("/ask", "")).toBeNull();
    expect(readDeepLink("/ask", "?q=")).toBeNull();
    expect(readDeepLink("/ask", "?q=%20%20")).toBeNull();
    expect(readDeepLink("/ask", "?q=" + "a".repeat(4001))).toBeNull();
    expect(readDeepLink("/ask", "?q=" + "a".repeat(4000))).not.toBeNull();
    expect(readDeepLink("/ASK", "?q=x")).toBeNull();
    expect(readDeepLink("/askme", "?q=x")).toBeNull();
    expect(readDeepLink("/", "")).toBeNull();
  });
});

describe("deepLinkPath / returnToFor", () => {
  it("is canonical", () => {
    expect(deepLinkPath({ kind: "case", caseId: "a:b" })).toBe("/case/a%3Ab");
    expect(deepLinkPath({ kind: "ask", q: "Why X?" })).toBe("/ask?q=Why%20X%3F");
    expect(returnToFor({ pathname: "/case/a:b/", search: "?junk" })).toBe("/case/a%3Ab");
    expect(returnToFor({ pathname: "/", search: "" })).toBeUndefined();
  });
});

describe("safeReturnTo", () => {
  it("returns the canonical path for good state", () => {
    expect(safeReturnTo({ returnTo: "/case/a%3Ab/" })).toBe("/case/a%3Ab");
    expect(safeReturnTo({ returnTo: "/ask?q=hi%20there&z=1" })).toBe("/ask?q=hi%20there");
  });
  it("refuses every hostile or malformed arm", () => {
    const bad: unknown[] = [
      { returnTo: "//evil.example/case/x" },
      { returnTo: "https://evil.example/case/x" },
      { returnTo: "/\\evil.example" },
      { returnTo: "/case/x\\y" },
      { returnTo: "javascript:alert(1)" },
      "/case/x",
      { returnTo: 5 },
      { returnTo: "/elsewhere" },
      {},
      null,
      undefined,
    ];
    for (const b of bad) expect(safeReturnTo(b), JSON.stringify(b)).toBeNull();
  });
});

describe("idpHintFor: the broker marker", () => {
  const at = (u: string) => {
    const x = new URL(u, "https://c.example");
    return idpHintFor({ pathname: x.pathname, search: x.search });
  };
  it("is openddil on either link shape, wherever the parameter sits", () => {
    expect(at("/case/C1?idp=openddil")).toBe("openddil");
    expect(at("/case/C1/?idp=openddil")).toBe("openddil");
    expect(at("/ask?q=Why&idp=openddil")).toBe("openddil");
    expect(at("/ask?idp=openddil&q=Why")).toBe("openddil");
  });
  it("is null for every other value, spelling, or path that is not a link", () => {
    for (const u of [
      "/case/C1",
      "/case/C1?idp=",
      "/case/C1?idp=OpenDDIL",
      "/case/C1?idp=openddil%20",
      "/case/C1?idp=keycloak",
      "/case/C1?IDP=openddil",
      "/?idp=openddil",
      "/elsewhere?idp=openddil",
      "/ask?idp=openddil",
      "/case/?idp=openddil",
    ]) expect(at(u), u).toBeNull();
  });
});

describe("signinArgs / afterSignin", () => {
  afterEach(() => window.history.replaceState({}, "", "/"));
  it("signinArgs is undefined off a link and carries the canonical path on one", () => {
    window.history.replaceState({}, "", "/");
    expect(signinArgs()).toBeUndefined();
    window.history.replaceState({}, "", "/case/a%3Ab");
    expect(signinArgs()).toEqual({ state: { returnTo: "/case/a%3Ab" } });
    window.history.replaceState({}, "", "/ask?q=Why%20X%3F");
    expect(signinArgs()).toEqual({ state: { returnTo: "/ask?q=Why%20X%3F" } });
  });
  it("with the marker, signinArgs adds the IdP hint and returnTo does NOT carry the marker", () => {
    window.history.replaceState({}, "", "/case/a%3Ab?idp=openddil");
    expect(signinArgs()).toEqual({ state: { returnTo: "/case/a%3Ab" }, extraQueryParams: { kc_idp_hint: "openddil" } });
    window.history.replaceState({}, "", "/ask?q=Why&idp=openddil");
    expect(signinArgs()).toEqual({ state: { returnTo: "/ask?q=Why" }, extraQueryParams: { kc_idp_hint: "openddil" } });
    window.history.replaceState({}, "", "/case/x?idp=keycloak");
    expect(signinArgs()).toEqual({ state: { returnTo: "/case/x" } });
  });
  it("afterSignin restores a good link, else the current pathname", () => {
    window.history.replaceState({}, "", "/?code=1&state=2");
    afterSignin({ state: { returnTo: "/case/a%3Ab" } });
    expect(window.location.pathname + window.location.search).toBe("/case/a%3Ab");
    for (const state of [{ returnTo: "//evil.example/case/x" }, "/case/x", undefined, { returnTo: "/elsewhere" }]) {
      window.history.replaceState({}, "", "/?code=1&state=2");
      afterSignin({ state });
      expect(window.location.pathname + window.location.search).toBe("/");
    }
    window.history.replaceState({}, "", "/?code=1");
    afterSignin(undefined);
    expect(window.location.search).toBe("");
  });
});

// The helpers above are only half the link: a `signinRedirect()` that forgets `signinArgs()` drops
// the link at login, with every arm above still green. So census the CALLS across shipped source
// (subject = the call, not a list of known sites), with a floor so a census that matches nothing
// cannot pass.
describe("every login carries the link", () => {
  const srcRoot = join(__dirname, "..");
  const shipped = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = join(dir, e.name);
      if (e.isDirectory()) return shipped(p);
      return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
    });
  const files = shipped(srcRoot).map((p) => ({ p, src: readFileSync(p, "utf8") }));

  it("each .signinRedirect( call passes signinArgs()", () => {
    const calls = files.flatMap(({ p, src }) =>
      [...src.matchAll(/\.signinRedirect\(([^)]*\)?)\)/g)].map((m) => ({ p, arg: m[1] })),
    );
    expect(calls.length, "the census found the four known sites at least").toBeGreaterThanOrEqual(4);
    expect(calls.filter((c) => c.arg !== "signinArgs()").map((c) => `${c.p}: (${c.arg})`)).toEqual([]);
  });

  it("the one onSigninCallback is afterSignin", () => {
    const cbs = files.flatMap(({ p, src }) =>
      [...src.matchAll(/onSigninCallback\s*:\s*([^,\n}]+)/g)].map((m) => `${p}: ${m[1].trim()}`),
    );
    expect(cbs).toHaveLength(1);
    expect(cbs[0]).toMatch(/: afterSignin$/);
  });
});

// ── /task/{task_id} (0.4.89) ───────────────────────────────────────────────
describe("the /task/{task_id} link", () => {
  it("T1: reads /task/<seg> with and without trailing slash, decoding once", () => {
    expect(readDeepLink("/task/abc", "")).toEqual({ kind: "task", taskId: "abc" });
    expect(readDeepLink("/task/abc/", "")).toEqual({ kind: "task", taskId: "abc" });
    expect(readDeepLink("/task/a%20b", "")).toEqual({ kind: "task", taskId: "a b" });
    expect(readDeepLink("/task/a%2520b", "")).toEqual({ kind: "task", taskId: "a%20b" });
    expect(readDeepLink("/task/" + "a".repeat(512), "")).not.toBeNull();
  });
  it("T1: rejects every other spelling", () => {
    for (const p of ["/Task/abc", "/TASK/abc", "/task/", "/task", "/task/a/b", "/tasks/x", "/task/%E0%A4%A", "/task/%20", "/task/" + "a".repeat(513)]) {
      expect(readDeepLink(p, ""), p).toBeNull();
    }
  });
  it("T2: deepLinkPath and safeReturnTo round-trip a task link canonically", () => {
    expect(deepLinkPath({ kind: "task", taskId: "a b/c" })).toBe("/task/a%20b%2Fc");
    expect(safeReturnTo({ returnTo: "/task/a%20b/" })).toBe("/task/a%20b");
    expect(safeReturnTo({ returnTo: "/task/abc?idp=openddil" })).toBe("/task/abc");
    expect(safeReturnTo({ returnTo: "/Task/abc" })).toBeNull();
    expect(returnToFor({ pathname: "/task/abc/", search: "?idp=openddil" })).toBe("/task/abc");
  });
  it("T2: ?idp=openddil behaves as on /case/ and /ask, and never rides in returnTo", () => {
    expect(idpHintFor({ pathname: "/task/abc", search: "?idp=openddil" })).toBe("openddil");
    expect(idpHintFor({ pathname: "/task/abc", search: "?idp=other" })).toBeNull();
    expect(idpHintFor({ pathname: "/Task/abc", search: "?idp=openddil" })).toBeNull();
    window.history.replaceState({}, "", "/task/abc?idp=openddil");
    try {
      expect(signinArgs()).toEqual({ state: { returnTo: "/task/abc" }, extraQueryParams: { kc_idp_hint: "openddil" } });
    } finally {
      window.history.replaceState({}, "", "/");
    }
  });
  it("leaves /case/ and /ask as they were", () => {
    expect(readDeepLink("/case/abc", "")).toEqual({ kind: "case", caseId: "abc" });
    expect(readDeepLink("/ask", "?q=hi")).toEqual({ kind: "ask", q: "hi" });
  });
});
