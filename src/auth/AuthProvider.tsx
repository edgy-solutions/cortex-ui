import React, { useEffect, useRef } from "react";
import { AuthProvider as OidcProvider, useAuth } from "react-oidc-context";
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

// Recovers automatically from silent-renewal failures instead of
// stranding the user on the "Retry Connection" screen in
// RequireAuth.
//
// Failure mode this handles: oidc-client-ts strictly validates that
// a silently-renewed id_token's `auth_time` claim matches the
// originally stored one (see ResponseValidator in
// node_modules/oidc-client-ts). Any server-side event that
// invalidates the Keycloak session — admin "Logout all sessions",
// SSO idle expiry, a new consent, `prompt=login` on the IdP —
// produces a fresh `auth_time` on the next refresh_token grant, the
// validator throws "auth_time in id_token does not match original
// auth_time", the error bubbles to `useAuth().error`, and the
// user is stuck with a Retry button that just re-triggers the
// same broken silent flow.
//
// Correct recovery: the user's session on the IdP genuinely
// changed; their stored artifacts are stale. Drop them and start a
// clean auth-code flow. `signinRedirect()` navigates them to
// Keycloak, which re-establishes a fresh session with matching
// `auth_time` on the return.
//
// Guarded by a ref so a burst of renewal errors doesn't produce
// overlapping redirects.
function SilentRenewRecovery() {
  const auth = useAuth();
  const recovering = useRef(false);
  useEffect(() => {
    return auth.events.addSilentRenewError((err) => {
      if (recovering.current) return;
      recovering.current = true;
      console.warn("[auth] silent renew failed — re-authenticating:", err?.message ?? err);
      void auth.removeUser().finally(() => {
        auth.signinRedirect().catch((e) => {
          console.error("[auth] signinRedirect after silent-renew failure also failed:", e);
          recovering.current = false;
        });
      });
    });
  }, [auth]);
  return null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  return (
    <OidcProvider {...oidcConfig}>
      <SilentRenewRecovery />
      {children}
    </OidcProvider>
  );
}
