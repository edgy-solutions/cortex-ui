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
}

declare global {
  interface Window {
    __RUNTIME_CONFIG__?: Partial<RuntimeConfig>;
  }
}

function resolve(key: keyof RuntimeConfig, fallback: string): string {
  return (
    window.__RUNTIME_CONFIG__?.[key] ||
    (import.meta.env[key] as string | undefined) ||
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
};
