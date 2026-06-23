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

export const useMeshConfig = () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [personaConfig, setPersonaConfig] = useState<Record<string, any>>({});

  useEffect(() => {
    getMeshConfig()
      .then((data) => {
        if (data.personas) setPersonaConfig(data.personas);
      })
      .catch((err) => console.error("Config load failed:", err));
  }, []);

  return { personaConfig };
};
