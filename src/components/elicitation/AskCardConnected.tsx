import { useState } from "react";
import { useAgent } from "@/hooks/useAgent";
import { AskCard } from "./AskCard";
import { dispatchReroute } from "./rerouteDispatch";

/**
 * The ask, wired to the send path.
 *
 * The split is deliberate: `AskCard` dispatches nothing and takes no hook, so its seals run
 * without a query client or an agent standing behind them. Everything that talks to the
 * outside world is here, and the decision of WHERE an answer goes is in `dispatchReroute`,
 * which is a pure function for the same reason.
 */
export function AskCardConnected({ component }: { component: unknown }) {
  const { sendMessage, isProcessing } = useAgent();
  const [blocked, setBlocked] = useState<string | null>(null);

  return (
    <>
      <AskCard
        component={component}
        pending={isProcessing}
        onReroute={(reroute, ask) => {
          // `sendMessage` takes the pick as its SECOND argument, so the phrase and the choice
          // stay separate all the way to the wire.
          const result = dispatchReroute(reroute, ask, sendMessage);
          setBlocked(result.blocked ?? null);
        }}
      />
      {blocked && (
        <p className="px-1 pb-2 pl-3 font-mono text-[10px] text-amber-400/80" data-reroute-blocked>
          {blocked}
        </p>
      )}
    </>
  );
}
