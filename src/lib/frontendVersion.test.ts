import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const BAKED = vi.hoisted(() => ({ sha: "bakedsha1" as string | null }));
vi.mock("@/lib/buildVersion", async (orig) => {
  const real = await orig<typeof import("@/lib/buildVersion")>();
  return {
    ...real,
    buildVersion: () => ({ component: "cortex-ui", repo: "cortex-ui", git_sha: BAKED.sha, built_at: null }),
  };
});

import {
  SEND_FRONTEND_VERSION_DEFAULT,
  __resetFrontendVersionForTests,
  isSendFrontendVersionEnabled,
  loadFrontendVersion,
} from "@/lib/frontendVersion";
import { buildInterviewBody } from "@/api/client";

const served = (body: string, ok = true) =>
  vi.fn(async () => ({ ok, status: ok ? 200 : 404, text: async () => body }) as unknown as Response);

beforeEach(() => {
  __resetFrontendVersionForTests();
  BAKED.sha = "bakedsha1";
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = {};
});
afterEach(() => {
  vi.restoreAllMocks();
  (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = undefined;
});

describe("loadFrontendVersion", () => {
  it("fetches exactly once across two calls", async () => {
    const f = served(JSON.stringify({ git_sha: "bakedsha1" }));
    await loadFrontendVersion(f as unknown as typeof fetch);
    await loadFrontendVersion(f as unknown as typeof fetch);
    expect(f, "version.json must be read once per page load").toHaveBeenCalledTimes(1);
  });
  it("resolves the baked sha when served matches", async () => {
    const f = served(JSON.stringify({ git_sha: "bakedsha1" }));
    expect(await loadFrontendVersion(f as unknown as typeof fetch)).toBe("bakedsha1");
  });
  it("resolves the baked sha and warns when served differs", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = served(JSON.stringify({ git_sha: "newersha2" }));
    expect(await loadFrontendVersion(f as unknown as typeof fetch)).toBe("bakedsha1");
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it("no baked sha -> the served sha", async () => {
    BAKED.sha = null;
    const f = served(JSON.stringify({ git_sha: "newersha2" }));
    expect(await loadFrontendVersion(f as unknown as typeof fetch)).toBe("newersha2");
  });
  it("no baked sha and fetch rejects -> unstamped", async () => {
    BAKED.sha = null;
    const f = vi.fn(async () => { throw new Error("offline"); });
    expect(await loadFrontendVersion(f as unknown as typeof fetch)).toBe("unstamped");
  });
  it("404 and non-JSON -> baked sha, no throw", async () => {
    expect(await loadFrontendVersion(served("", false) as unknown as typeof fetch)).toBe("bakedsha1");
    __resetFrontendVersionForTests();
    expect(await loadFrontendVersion(served("<html>") as unknown as typeof fetch)).toBe("bakedsha1");
  });
});

describe("the /interview/stream body", () => {
  const req = { message: "hi", session_id: "s1" } as unknown as Parameters<typeof buildInterviewBody>[0];
  beforeEach(() => {
    vi.stubGlobal("fetch", served(JSON.stringify({ git_sha: "bakedsha1" })));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("flag OFF -> frontend_version key is absent", async () => {
    const body = JSON.parse(await buildInterviewBody(req));
    expect("frontend_version" in body).toBe(false);
    expect(body.frontend_id).toBeTruthy();
  });
  it("flag ON -> frontend_version equals the baked sha", async () => {
    (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = { VITE_SEND_FRONTEND_VERSION: "true" };
    const body = JSON.parse(await buildInterviewBody(req));
    expect(body.frontend_version).toBe("bakedsha1");
  });
  it("only the exact string true enables", () => {
    for (const v of ["1", "TRUE", "yes", "false"]) {
      (window as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__ = { VITE_SEND_FRONTEND_VERSION: v };
      expect(isSendFrontendVersionEnabled(), v).toBe(false);
    }
  });
});

// ── THE HONOUR CONDITION (cross-repo) ───────────────────────────────────────────────────────
// The sibling checkout is found by walking UP from this file (works from .claude/worktrees/),
// or CORTEX_PRODUCER_ROOT. Other seals assume a fixed ../../.. depth and fail in a worktree.
function findGateway(): string | null {
  const rel = "src/iagent/gateway.py";
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, rel))) return path.join(env, rel);
  let dir = __dirname;
  for (let i = 0; i < 8; i++) {
    for (const name of ["invincible-agent", "ia-01"]) {
      const p = path.join(dir, name, rel);
      if (existsSync(p)) return p;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return null;
}
const GATEWAY = findGateway();
const CLASS_BODY = (() => {
  if (!GATEWAY) return "";
  const src = readFileSync(GATEWAY, "utf8");
  const m = src.match(/^class InterviewRequest\b[^\n]*:\n((?:[ \t]+[^\n]*\n|[ \t]*\n)*)/m);
  return m ? m[1]! : "";
})();
const DECLARED = /^\s+frontend_version\s*:/m.test(CLASS_BODY);

describe("frontend_version honour condition", () => {
  it("found the peer gateway and its InterviewRequest body", () => {
    expect(GATEWAY, "no invincible-agent checkout found (set CORTEX_PRODUCER_ROOT) — the honour arm VERIFIED NOTHING").not.toBeNull();
    expect(CLASS_BODY, "class InterviewRequest not found in gateway.py").toContain("message");
  });
  it("if the flag defaults ON, InterviewRequest declares frontend_version", () => {
    if (!SEND_FRONTEND_VERSION_DEFAULT) return;
    expect(
      DECLARED,
      "the flag defaults on but the platform discards frontend_version — declare it on InterviewRequest first",
    ).toBe(true);
  });
  it.skipIf(!DECLARED)("when declared, the type permits a string", () => {
    expect(CLASS_BODY).toMatch(/frontend_version\s*:\s*(str|Optional\[str\]|str \| None)/);
  });
});
