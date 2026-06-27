/**
 * Test setup — runs before any cortex-ui source is imported. The
 * source modules (config.ts in particular) read window.__RUNTIME_CONFIG__
 * at import-time, so the polyfill MUST be set BEFORE the source is
 * loaded. ESM import ordering: setup file runs first because it's
 * imported in a side-effect-only form by the test entry.
 */
(globalThis as any).window = {
  __RUNTIME_CONFIG__: {
    VITE_ELECTRIC_URL: process.env.VITE_ELECTRIC_URL ?? "http://localhost:3000",
  },
};
// Ensure import.meta.env shim too (config.ts also reads it as fallback).
(globalThis as any).importMetaEnv = {};
