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
  // MinIO federation for the FederatedImage component. Empty string
  // means "no override" — the AWS SDK uses its built-in defaults
  // (real AWS S3 + virtual-hosted style + the literal placeholder
  // role ARN in FederatedImage), which won't reach MinIO. Operators
  // set these via helm cortexUi.env.VITE_AWS_* and docker-entrypoint.sh
  // writes them into window.__RUNTIME_CONFIG__ at container start.
  VITE_AWS_S3_ENDPOINT: string;
  VITE_AWS_REGION: string;
  VITE_AWS_ROLE_ARN: string;
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
  VITE_AWS_S3_ENDPOINT: resolve("VITE_AWS_S3_ENDPOINT", ""),
  VITE_AWS_REGION: resolve("VITE_AWS_REGION", "us-east-1"),
  VITE_AWS_ROLE_ARN: resolve("VITE_AWS_ROLE_ARN", ""),
};
