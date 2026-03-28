#!/bin/sh
# ──────────────────────────────────────────────────────────
# inject-env.sh — Runtime Environment Injection
# ──────────────────────────────────────────────────────────
# Runs BEFORE nginx starts.  Reads VITE_* env vars that were
# set by the Helm chart / k8s deployment and writes them into
# /workspace/dist/config.js so the browser can read them at
# page load via <script src="/config.js">.
#
# This solves the classic "Vite bakes env at build time" problem.
# ──────────────────────────────────────────────────────────

CONFIG_PATH="/workspace/dist/config.js"

echo "🔧  inject-env: writing runtime config to ${CONFIG_PATH}"

cat > "${CONFIG_PATH}" <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-}",
  VITE_KEYCLOAK_REALM_URL: "${VITE_KEYCLOAK_REALM_URL:-}",
  VITE_KEYCLOAK_CLIENT_ID: "${VITE_KEYCLOAK_CLIENT_ID:-}",
  VITE_NO_AUTH: "${VITE_NO_AUTH:-false}",
};
EOF

echo "✅  inject-env: config.js written"
cat "${CONFIG_PATH}"

# Hand off to the original entrypoint (nginx)
exec "$@"
