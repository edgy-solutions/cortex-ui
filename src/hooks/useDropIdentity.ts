import { useAuth } from "react-oidc-context";
import { usePersonaStore } from "@/store/usePersonaStore";
import { dropIdentity } from "@/lib/dropIdentity";

/** The caller's own `on_behalf_of` for a drop — `authz_id` from `/me/entitlements`; see `dropIdentity`. */
export function useDropIdentity(): string | null {
  const email = useAuth().user?.profile.email ?? null;
  const entitlements = usePersonaStore((s) => s.entitlements);
  return dropIdentity(entitlements, email);
}
