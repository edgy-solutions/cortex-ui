import React from "react";
import { AuthProvider as OidcProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { config } from "@/config";

const oidcConfig = {
  authority: config.VITE_KEYCLOAK_REALM_URL,
  client_id: config.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // Silent renewal via refresh_token grant — no iframe.
  //
  // Verified at node_modules/oidc-client-ts/dist/esm/oidc-client-ts.js
  // line 3114: UserManager.signinSilent() checks for
  // `user.refresh_token` and if present, uses the refresh_token grant
  // directly via a background fetch to Keycloak's token endpoint. No
  // HTML loaded, no React tree re-mount, no chat-submit re-fire.
  //
  // The iframe-based silent_redirect_uri path (which broke 2d79b62 when
  // set to window.location.origin) is only used as a FALLBACK when no
  // refresh_token is available. Keycloak issues a refresh_token by
  // default for the standard auth-code flow on a public client like
  // cortex-ui, so the refresh-token path is what runs in practice.
  //
  // Combined with the iagent helm chart's 1h accessTokenLifespan
  // (commit 0856b0f) and 8h SSO idle, this means: any query crossing
  // the 1h boundary refreshes silently in the background; the user
  // doesn't notice. The session itself survives 8h of activity.
  automaticSilentRenew: true,
  // Renew 60 s before access token expiry so a request that's just
  // starting doesn't race the refresh.
  accessTokenExpiringNotificationTimeInSeconds: 60,
  onSigninCallback: () => {
    // Remove the code and state from the URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
