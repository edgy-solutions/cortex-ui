import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import vm from "node:vm";
import {
  FEATURE_FLAGS,
  parseFeatureList,
  isFeatureEnabled,
  __resetFeatureFlagWarningForTests,
} from "./featureFlags";
import { isCanvasExportEnabled } from "./canvasExport";
import { isIngestUiEnabled, isIngestMockEnabled } from "./ingestFlag";
import { config } from "@/config";

const ROOT = path.join(__dirname, "..", "..");
const ENTRYPOINT_PATH = path.join(ROOT, "docker-entrypoint.sh");

function clearRuntimeConfig() {
  delete (window as unknown as { __RUNTIME_CONFIG__?: unknown }).__RUNTIME_CONFIG__;
}

function setRuntimeFeatures(value: string) {
  (window as unknown as { __RUNTIME_CONFIG__?: Record<string, string> }).__RUNTIME_CONFIG__ = {
    VITE_FEATURES: value,
  };
}

beforeEach(() => {
  clearRuntimeConfig();
  window.localStorage.clear();
  __resetFeatureFlagWarningForTests();
});

afterEach(() => {
  clearRuntimeConfig();
  window.localStorage.clear();
});

describe("parseFeatureList", () => {
  it("splits on commas, trims whitespace, and reports nothing unknown for valid names", () => {
    const { enabled, unknown } = parseFeatureList(" canvasExport , ingest ,ingestMock");
    expect([...enabled].sort()).toEqual(["canvasExport", "ingest", "ingestMock"].sort());
    expect(unknown).toEqual([]);
  });

  it("reports an unrecognised name as unknown, deduped and in order", () => {
    const { enabled, unknown } = parseFeatureList("canvasExport,bogus,bogus,alsoBogus");
    expect(enabled.has("canvasExport")).toBe(true);
    expect(unknown).toEqual(["bogus", "alsoBogus"]);
  });

  it("is case-sensitive — a differently-cased name is unknown, not matched", () => {
    const { enabled, unknown } = parseFeatureList("CanvasExport");
    expect(enabled.size).toBe(0);
    expect(unknown).toEqual(["CanvasExport"]);
  });

  it("empty or undefined input enables nothing and reports nothing unknown", () => {
    expect(parseFeatureList("")).toEqual({ enabled: new Set(), unknown: [] });
    expect(parseFeatureList(undefined)).toEqual({ enabled: new Set(), unknown: [] });
    expect(parseFeatureList(",, ,")).toEqual({ enabled: new Set(), unknown: [] });
  });
});

describe("isFeatureEnabled", () => {
  it("is off by default — no runtime config, no localStorage", () => {
    expect(isFeatureEnabled("canvasExport")).toBe(false);
  });

  it("turns on via window.__RUNTIME_CONFIG__.VITE_FEATURES", () => {
    setRuntimeFeatures("canvasExport");
    expect(isFeatureEnabled("canvasExport")).toBe(true);
  });

  it("near side: enabling canvasExport does NOT enable ingest", () => {
    setRuntimeFeatures("canvasExport");
    expect(isFeatureEnabled("ingest")).toBe(false);
  });

  it("turns on via the localStorage per-browser override", () => {
    window.localStorage.setItem("cortex.ingest", "1");
    expect(isFeatureEnabled("ingest")).toBe(true);
  });

  it("warns once for an unknown flag name, not on every call", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setRuntimeFeatures("bogus");
    isFeatureEnabled("canvasExport");
    isFeatureEnabled("ingest");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("bogus");
    warn.mockRestore();
  });
});

describe("the three public readers delegate to isFeatureEnabled", () => {
  it("each flag is off when VITE_FEATURES is absent", () => {
    expect(isCanvasExportEnabled()).toBe(false);
    expect(isIngestUiEnabled()).toBe(false);
    expect(isIngestMockEnabled()).toBe(false);
  });

  it("each flag turns on when its name is present in VITE_FEATURES", () => {
    setRuntimeFeatures("canvasExport,ingest,ingestMock");
    expect(isCanvasExportEnabled()).toBe(true);
    expect(isIngestUiEnabled()).toBe(true);
    expect(isIngestMockEnabled()).toBe(true);
  });
});

// ── CHARSET SEAL ────────────────────────────────────────────────────────────────────────────
// Guards the source TEXT of docker-entrypoint.sh's sanitizer, not a copy of it here — a copy
// could drift from the real charset and this seal would keep passing over a lie.
const ENTRYPOINT_SRC = readFileSync(ENTRYPOINT_PATH, "utf8");
const TR_CHARSET_MATCHES = [...ENTRYPOINT_SRC.matchAll(/tr -cd '([^']+)'/g)];
if (TR_CHARSET_MATCHES.length !== 1) {
  throw new Error(
    `featureFlags.test.ts: expected exactly one "tr -cd '<charset>'" in docker-entrypoint.sh, ` +
      `found ${TR_CHARSET_MATCHES.length} — the CHARSET SEAL and ENTRYPOINT SEAL below both ` +
      `depend on extracting this exact charset.`,
  );
}
const CHARSET = TR_CHARSET_MATCHES[0]![1]!;
const CHARSET_ALL_RE = new RegExp(`^[${CHARSET}]+$`);
const CHARSET_CHAR_RE = new RegExp(`[${CHARSET}]`);

function sanitizeWithCharset(raw: string): string {
  return [...raw].filter((c) => CHARSET_CHAR_RE.test(c)).join("");
}

describe("CHARSET SEAL — every flag name survives the entrypoint's sanitizer unchanged", () => {
  it("every FEATURE_FLAGS name matches the extracted charset in full", () => {
    for (const flag of FEATURE_FLAGS) {
      expect(CHARSET_ALL_RE.test(flag), `flag "${flag}" is not fully in charset [${CHARSET}]`).toBe(
        true,
      );
    }
  });
});

// ── ENTRYPOINT SEAL — RUNS docker-entrypoint.sh for real ───────────────────────────────────
function findSh(): string {
  const candidates = ["sh", "C:\\Program Files\\Git\\bin\\sh.exe", "C:\\Program Files\\Git\\usr\\bin\\sh.exe"];
  for (const candidate of candidates) {
    const r = spawnSync(candidate, ["-c", "true"], { encoding: "utf8" });
    if (!r.error && r.status === 0) return candidate;
  }
  throw new Error("no sh found — this seal must run, it may not skip");
}

function toShPath(p: string): string {
  return p.split(path.sep).join("/");
}

function runEntrypoint(env: NodeJS.ProcessEnv, configPath: string): void {
  const sh = findSh();
  const r = spawnSync(sh, [toShPath(ENTRYPOINT_PATH), "true"], { encoding: "utf8", env });
  if (r.status !== 0) {
    throw new Error(
      `docker-entrypoint.sh exited ${r.status} (configPath=${configPath})\nstderr:\n${r.stderr}`,
    );
  }
}

function evalConfigJs(configPath: string): { window: { __RUNTIME_CONFIG__?: Record<string, unknown>; pwned?: unknown } } {
  const src = readFileSync(configPath, "utf8");
  const sandbox: { window: Record<string, unknown> } = { window: {} };
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox);
  return sandbox as unknown as { window: { __RUNTIME_CONFIG__?: Record<string, unknown>; pwned?: unknown } };
}

describe("ENTRYPOINT SEAL — docker-entrypoint.sh actually sanitizes VITE_FEATURES", () => {
  const MALICIOUS = 'canvasExport, ingest";window.pwned=1;//';

  it("drops everything outside the charset, writes no pwned global, and reports the junk as unknown", () => {
    const configPath = toShPath(path.join(tmpdir(), `cortex-config-${Date.now()}-${Math.random()}.js`));
    runEntrypoint({ ...process.env, CORTEX_CONFIG_PATH: configPath, VITE_FEATURES: MALICIOUS }, configPath);

    const { window: sandboxWindow } = evalConfigJs(configPath);

    expect(sandboxWindow.pwned).toBeUndefined();

    const expected = sanitizeWithCharset(MALICIOUS);
    expect(expected).toBe("canvasExport,ingestwindowpwned1");
    expect(sandboxWindow.__RUNTIME_CONFIG__?.VITE_FEATURES).toBe(expected);

    const parsed = parseFeatureList(sandboxWindow.__RUNTIME_CONFIG__?.VITE_FEATURES as string);
    expect(parsed.enabled.has("canvasExport")).toBe(true);
    expect(parsed.unknown).toContain("ingestwindowpwned1");
  });

  // ⛔ A PAYLOAD THAT PARSES. MALICIOUS above ends in `//`, which comments out the literal's own
  // closing `",` — so against an UNSANITIZED entrypoint config.js is a SyntaxError and the run dies
  // before `pwned` is ever asserted (measured: that mutant went red on the throw, not the arm).
  // This one closes the string and opens a sibling property, so the unsanitized file is valid JS
  // that EXECUTES the assignment; only the sanitizer stands between it and `window.pwned`.
  it("a payload that stays valid inside the object literal still writes no pwned global", () => {
    const PARSES = 'canvasExport", pwned: (window.pwned = 1), x: "';
    const configPath = toShPath(path.join(tmpdir(), `cortex-config-${Date.now()}-${Math.random()}.js`));
    runEntrypoint({ ...process.env, CORTEX_CONFIG_PATH: configPath, VITE_FEATURES: PARSES }, configPath);

    const { window: sandboxWindow } = evalConfigJs(configPath);
    expect(sandboxWindow.pwned, "the injected assignment ran").toBeUndefined();
    expect(sandboxWindow.__RUNTIME_CONFIG__?.VITE_FEATURES).toBe(sanitizeWithCharset(PARSES));
  });

  it("with VITE_FEATURES unset, the key is present and empty", () => {
    const configPath = toShPath(path.join(tmpdir(), `cortex-config-${Date.now()}-${Math.random()}.js`));
    const env = { ...process.env };
    delete env.VITE_FEATURES;
    runEntrypoint({ ...env, CORTEX_CONFIG_PATH: configPath }, configPath);

    const { window: sandboxWindow } = evalConfigJs(configPath);
    expect(sandboxWindow.__RUNTIME_CONFIG__?.VITE_FEATURES).toBe("");
  });

  it("the key set written by the entrypoint equals Object.keys(config) from src/config.ts", () => {
    const configPath = toShPath(path.join(tmpdir(), `cortex-config-${Date.now()}-${Math.random()}.js`));
    runEntrypoint({ ...process.env, CORTEX_CONFIG_PATH: configPath }, configPath);

    const { window: sandboxWindow } = evalConfigJs(configPath);
    const writtenKeys = Object.keys(sandboxWindow.__RUNTIME_CONFIG__ ?? {}).sort();
    const configKeys = Object.keys(config).sort();
    expect(writtenKeys).toEqual(configKeys);
  });
});
