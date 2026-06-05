import React from "react";
import { AuthProvider as OidcProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { config } from "@/config";

const oidcConfig = {
  authority: config.VITE_KEYCLOAK_REALM_URL,
  client_id: config.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // Auto-refresh the access token in the background before it expires.
  // Without this the user gets bounced back to login the moment Keycloak's
  // accessTokenLifespan runs out (5 min by default, now 1 h after our
  // realm update — but a single long agent query can still cross either
  // boundary on a busy backend). oidc-client-ts handles the refresh-token
  // dance transparently; API requests in flight never see a 401.
  automaticSilentRenew: true,
  // Trigger the silent renew 60 s before the token actually expires so
  // a request that's just starting doesn't race the refresh.
  accessTokenExpiringNotificationTimeInSeconds: 60,
  // Use the standard renew URL (same origin as redirect_uri). No
  // separate silent-renew.html page is needed — react-oidc-context
  // performs the silent renew via iframe against the same /auth
  // endpoint.
  silent_redirect_uri: window.location.origin,
  onSigninCallback: () => {
    // Remove the code and state from the URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
