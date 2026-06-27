/**
 * Runtime Configuration
 *
 * Vite bakes import.meta.env.VITE_* values at BUILD TIME.
 * In containerised deployments the env vars are only available at runtime,
 * so we inject them via a <script src="/config.js"> that writes to
 * window.__RUNTIME_CONFIG__. This module merges both sources with
 * runtime values taking priority.
 *
 * Precedence: window.__RUNTIME_CONFIG__  >  import.meta.env  >  defaults
 */

interface RuntimeConfig {
  VITE_API_URL: string;
  VITE_KEYCLOAK_REALM_URL: string;
  VITE_KEYCLOAK_CLIENT_ID: string;
  VITE_NO_AUTH: string;
  // Hop 3 of the projector build plan (commit 0eda9f7). Electric URL
  // for the answer_artifact_projection shape subscription. Empty
  // string disables Electric entirely (useful for Part 2's Shape C
  // test which proves Electric is the path — when both are running,
  // the absence-of-SSE probe runs over the provenance map; when
  // Electric is cut off, the propagation probe asserts the store
  // stays empty for Electric-covered fields).
  VITE_ELECTRIC_URL: string;
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: Partial<RuntimeConfig>;
  }
}

function resolve(key: keyof RuntimeConfig, fallback: string): string {
  return (
    window.__RUNTIME_CONFIG__?.[key] ||
    // import.meta.env may be undefined under Node tsx (test harness);
    // fall through to fallback in that case. Vite always defines it
    // at build time, so production is unaffected.
    ((import.meta as { env?: Record<string, string | undefined> }).env?.[key]) ||
    fallback
  );
}

export const config: RuntimeConfig = {
  VITE_API_URL: resolve("VITE_API_URL", "http://localhost:8000"),
  VITE_KEYCLOAK_REALM_URL: resolve(
    "VITE_KEYCLOAK_REALM_URL",
    "http://localhost:8080/realms/cortex"
  ),
  VITE_KEYCLOAK_CLIENT_ID: resolve("VITE_KEYCLOAK_CLIENT_ID", "cortex-ui"),
  VITE_NO_AUTH: resolve("VITE_NO_AUTH", "false"),
  VITE_ELECTRIC_URL: resolve("VITE_ELECTRIC_URL", "http://localhost:3000"),
};
