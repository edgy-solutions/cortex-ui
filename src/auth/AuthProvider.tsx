import React from "react";
import { AuthProvider as OidcProvider } from "react-oidc-context";
import { WebStorageStateStore } from "oidc-client-ts";
import { config } from "@/config";

const oidcConfig = {
  authority: config.VITE_KEYCLOAK_REALM_URL,
  client_id: config.VITE_KEYCLOAK_CLIENT_ID,
  redirect_uri: window.location.origin,
  userStore: new WebStorageStateStore({ store: window.sessionStorage }),
  onSigninCallback: () => {
    // Remove the code and state from the URL after successful login
    window.history.replaceState({}, document.title, window.location.pathname);
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <OidcProvider {...oidcConfig}>{children}</OidcProvider>;
}
