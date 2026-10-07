import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isMockGroundingEnabled } from "./mockGroundingEmitter";

const KEY = "cortex-mock-grounding";

function setRuntimeConfig(value: Record<string, string> | undefined) {
  (window as unknown as { __RUNTIME_CONFIG__?: Record<string, string> }).__RUNTIME_CONFIG__ =
    value;
}

beforeEach(() => {
  setRuntimeConfig(undefined);
  window.localStorage.clear();
});

afterEach(() => {
  setRuntimeConfig(undefined);
  window.localStorage.clear();
});

describe("isMockGroundingEnabled — reads the runtime config, not a build-time snapshot", () => {
  it("is off when window.__RUNTIME_CONFIG__.VITE_MOCK_GROUNDING is absent", () => {
    expect(isMockGroundingEnabled()).toBe(false);
  });

  it('turns on via window.__RUNTIME_CONFIG__.VITE_MOCK_GROUNDING = "1"', () => {
    setRuntimeConfig({ VITE_MOCK_GROUNDING: "1" });
    expect(isMockGroundingEnabled()).toBe(true);
  });

  it('also turns on for the string "true"', () => {
    setRuntimeConfig({ VITE_MOCK_GROUNDING: "true" });
    expect(isMockGroundingEnabled()).toBe(true);
  });

  it("stays off for any other value", () => {
    setRuntimeConfig({ VITE_MOCK_GROUNDING: "0" });
    expect(isMockGroundingEnabled()).toBe(false);
  });

  it("the localStorage override still wins even when the runtime config says off", () => {
    window.localStorage.setItem(KEY, "1");
    setRuntimeConfig({ VITE_MOCK_GROUNDING: "0" });
    expect(isMockGroundingEnabled()).toBe(true);
  });

  it("is read live — a value set after this module has already loaded is still seen", () => {
    expect(isMockGroundingEnabled()).toBe(false);
    setRuntimeConfig({ VITE_MOCK_GROUNDING: "1" });
    expect(isMockGroundingEnabled()).toBe(true);
  });
});
