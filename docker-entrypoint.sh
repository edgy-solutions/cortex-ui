#!/bin/sh
set -e

# Write the runtime configuration to the dist directory before starting nginx
CONFIG_PATH="/usr/share/nginx/html/config.js"

echo "🔧 inject-env: writing runtime config to ${CONFIG_PATH}"

cat > "${CONFIG_PATH}" <<EOF
window.__RUNTIME_CONFIG__ = {
  VITE_API_URL: "${VITE_API_URL:-http://localhost:8000}",
  VITE_KEYCLOAK_REALM_URL: "${VITE_KEYCLOAK_REALM_URL:-http://localhost:8080/realms/cortex}",
  VITE_KEYCLOAK_CLIENT_ID: "${VITE_KEYCLOAK_CLIENT_ID:-cortex-ui}",
  VITE_NO_AUTH: "${VITE_NO_AUTH:-false}",
  VITE_AWS_S3_ENDPOINT: "${VITE_AWS_S3_ENDPOINT:-}",
  VITE_AWS_REGION: "${VITE_AWS_REGION:-us-east-1}",
  VITE_AWS_ROLE_ARN: "${VITE_AWS_ROLE_ARN:-}"
};
EOF

echo "✅ inject-env: config.js written successfully."
cat "${CONFIG_PATH}"

# Execute the CMD (which is nginx -g "daemon off;")
exec "$@"
