import React from "react";
import { AuthProvider as OidcProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { config } from "@/config";

const oidcConfig = {
  authority: config.VITE_KEYCLOAK_REALM_URL,
  client_id: config.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  // NOTE: automaticSilentRenew is intentionally NOT enabled here.
  //
  // The previous attempt (commit 2d79b62) set
  //   automaticSilentRenew: true
  //   silent_redirect_uri: window.location.origin
  // which caused the renewal iframe to load the entire React app
  // at the same origin. The iframe-mounted app re-fired in-flight
  // chat submissions, producing duplicate POSTs to /interview/stream
  // and the visible "Analyzing intent... / Analyzing intent..."
  // loop in NeuralStream output.
  //
  // Proper silent renew requires a dedicated stub page (e.g.
  // /silent-renew.html shipped under public/) that runs only the
  // oidc-client-ts callback completion and does NOT mount React.
  // Until that lands, we rely on Keycloak's 1 h accessTokenLifespan
  // (set by the iagent helm chart in commit 0856b0f) which is long
  // enough for any normal query. If the user does cross the boundary
  // they'll be prompted to log in again — degraded but not broken.
  onSigninCallback: () => {
    // Remove the code and state from the URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
