import { useAuth } from "react-oidc-context";
import { usePersonaStore } from "@/store/usePersonaStore";
import { dropIdentity } from "@/lib/dropIdentity";
import { config } from "@/config";

/** The caller's own `on_behalf_of` for a drop — `authz_id` from `/me/entitlements`; see `dropIdentity`. */
export function useDropIdentity(): string | null {
  const email = useAuth().user?.profile.email ?? null;
  const entitlements = usePersonaStore((s) => s.entitlements);
  // PROTOTYPE (promotion-review-at-scale): no-auth dev mode has no email and no entitlements, so
  // every drop was disabled. A stand-in identity lets the ingest mock take a drop there.
  return dropIdentity(entitlements, email) ?? (config.VITE_NO_AUTH === "true" ? "no-auth@localhost" : null);
}
