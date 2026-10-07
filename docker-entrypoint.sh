#!/bin/sh
set -e

# Write the runtime configuration to the dist directory before starting nginx
# Overridable for the seal that runs this script (featureFlags.test.ts's ENTRYPOINT SEAL).
CONFIG_PATH="${CORTEX_CONFIG_PATH:-/usr/share/nginx/html/config.js}"

echo "🔧 inject-env: writing runtime config to ${CONFIG_PATH}"

# VITE_FEATURES is interpolated into a JS string literal below, unquoted — anything outside the
# flag-name charset is dropped, never escaped/quoted. A flag NAME must therefore live in this
# charset (sealed in featureFlags.test.ts's ENTRYPOINT SEAL, which extracts this exact set).
FEATURES=$(printf '%s' "${VITE_FEATURES:-}" | tr -cd 'A-Za-z0-9,_-')

# VITE_MOCK_GROUNDING is interpolated unquoted like VITE_FEATURES above, so it gets the same
# treatment: sanitize to a charset that cannot close the string literal or inject JS. The value
# is only ever "1"/"true"/"" (see mockGroundingEmitter.ts), so a lowercase-alnum charset is
# sufficient — no comma/dash needed here, unlike the flag-name list. The charset is held in a
# variable and passed to tr double-quoted, rather than as a second inline quoted literal right
# after the tr flags, so featureFlags.test.ts's CHARSET SEAL (which greps this file for exactly
# one such inline-quoted charset and binds it to the FEATURES sanitizer) keeps matching only
# the FEATURES charset below, unambiguously.
MOCK_GROUNDING_CHARSET='a-z0-9'
MOCK_GROUNDING=$(printf '%s' "${VITE_MOCK_GROUNDING:-}" | tr -cd "${MOCK_GROUNDING_CHARSET}")

cat > "${CONFIG_PATH}" <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-http://localhost:8000}",
  VITE_KEYCLOAK_REALM_URL: "${VITE_KEYCLOAK_REALM_URL:-http://localhost:8080/realms/cortex}",
  VITE_KEYCLOAK_CLIENT_ID: "${VITE_KEYCLOAK_CLIENT_ID:-cortex-ui}",
  VITE_NO_AUTH: "${VITE_NO_AUTH:-false}",
  VITE_ELECTRIC_URL: "${VITE_ELECTRIC_URL:-}",
  VITE_FEATURES: "${FEATURES}",
  VITE_MOCK_GROUNDING: "${MOCK_GROUNDING}",
};
EOF

echo "✅ inject-env: config.js written successfully."
cat "${CONFIG_PATH}"

# Execute the CMD (which is nginx -g "daemon off;")
exec "$@"
