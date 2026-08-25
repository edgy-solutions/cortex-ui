import { useEffect, useState } from "react";
import * as LucideIcons from "lucide-react";
import { getMeshConfig } from "@/api/client";

/**
 * Persona configuration helpers.
 *
 * Originally lived in `NeuralStream/AgentTeamLoader.tsx`. Extracted to
 * its own module on 2026-06-22 when AgentTeamLoader was deleted per
 * Option A clean cut (the "summoning specialized mesh agents" badges
 * were decorative theater). The persona CONFIG (icon, color, label
 * per persona kind) is still load-bearing — Canvas widgets surface
 * an output-side persona attribution per [[persona-split]] ADR-0009,
 * and SemanticInterpreter colors components by their source persona.
 *
 * What this module gives you:
 *   - useMeshConfig(): React hook returning { personaConfig }, where
 *     personaConfig is a Record<personaKey, { label, icon, color, bg }>
 *     fetched once from the gateway's /mesh-config endpoint.
 *   - DynamicIcon: renders a lucide-react icon by string name, with a
 *     HelpCircle fallback for unknown names. Used by anything that
 *     reads `personaConfig[key].icon` and needs to draw it.
 *
 * Per [[persona-split]] — output-side persona only (the verb edge's
 * owner_persona). Caller-identity persona (from Keycloak claims) is
 * a separate future ADR ([[pingsso-claim-gap]]).
 */
export const DynamicIcon = ({
  name,
  className,
}: {
  name: string;
  className?: string;
}) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IconComponent = (LucideIcons as any)[name] || LucideIcons.HelpCircle;
  return <IconComponent className={className} />;
};

/**
 * ONE fetch per session, shared by every caller.
 *
 * The defect this replaces: `useMeshConfig` fetched on mount with `[]` deps — one request per
 * MOUNT, which sounds fine until you notice where it mounts. `SemanticInterpreter` calls it,
 * and `SemanticInterpreter` is rendered once per CARD (StageCard, PinnedAnswerCard, CanvasPane).
 * A session with seventy answers therefore issued ~seventy simultaneous `GET /mesh/config` on
 * load, for a payload that is global, immutable, and byte-identical for every one of them.
 *
 * That fan-out was enough to saturate cortex-bff's event loop, make `/health` miss its
 * one-second readiness window, and get the pod pulled from the service endpoints — at which
 * point the edge returned 404 with no CORS headers and every browser call failed while
 * `kubectl get pods` still read Running 1/1.
 *
 * Note the shape, because it is why this hid for a week: **a per-instance fetch of global state
 * converts artifact count into request fan-out.** The defect grew with the data. At demo-seed
 * scale it was invisible; at real scale it took the backend off the mesh.
 *
 * It was NOT a retry loop, and adding backoff would have fixed nothing — there is no retry
 * here. Seventy first-attempts have nothing to back off from. The problem is fan-out, not
 * repetition, and the cure for fan-out is sharing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MeshConfig = { personas?: Record<string, any> };

let inflight: Promise<MeshConfig> | null = null;

function loadMeshConfigOnce(): Promise<MeshConfig> {
  if (!inflight) {
    inflight = getMeshConfig().catch((err) => {
      // CLEAR ON FAILURE. A rejected promise left in the slot would poison the cache for the
      // rest of the session: every card that mounted afterwards would await a failure from
      // minutes ago and there would be no path back without a reload. That is the
      // fetch-once-never-retry trap the entitlements picker already taught us, one abstraction
      // up — and the reason "at most once" here means once per attempt-wave, not once per
      // session. The next mount after a failure starts fresh; the cards mounting DURING a
      // failure still share its single request.
      inflight = null;
      throw err;
    });
  }
  return inflight;
}

/**
 * Test seam. Production never calls this — the cache is process-lifetime by design, and a
 * reset in application code would reintroduce exactly the fan-out this module exists to stop.
 */
export function __resetMeshConfigCache(): void {
  inflight = null;
}

export const useMeshConfig = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [personaConfig, setPersonaConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    let alive = true;
    loadMeshConfigOnce()
      .then((data) => {
        // Guarded because every card shares this promise: a card unmounted while the single
        // in-flight request was outstanding must not set state after the fact.
        if (alive && data.personas) setPersonaConfig(data.personas);
      })
      .catch((err) => console.error("Config load failed:", err));
    return () => {
      alive = false;
    };
  }, []);

  return { personaConfig };
};
