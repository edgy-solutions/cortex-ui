import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  useCurrentRouting,
  useCurrentGraphTrace,
  useCurrentGraphAlternates,
} from "@/store/useCanvasStore";
import { fetchDecisionSubgraph } from "@/api/client";
import {
  collectCapturedDecision,
  buildCorridorData,
  type CorridorData,
} from "@/lib/decisionMap";
import { SpoCorridor } from "./SpoCorridor";

/**
 * DecisionMap — the decision-path map (SPO corridor, design handoff 2a).
 *
 * Fetches the bounded live-graph neighborhood (/decision_subgraph), diffs
 * it against the captured decision to derive the honesty-states, and hands
 * a clean CorridorData to <SpoCorridor/> for the high-fidelity render. The
 * live read failing → the corridor renders every node "unverified" with
 * the couldn't-check story — never a fabricated current-state.
 */
export function DecisionMap() {
  const routing = useCurrentRouting();
  const graphTrace = useCurrentGraphTrace();
  const alternates = useCurrentGraphAlternates();
  const [data, setData] = useState<CorridorData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routing) {
      setData(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const captured = collectCapturedDecision(routing, graphTrace, alternates);
    fetchDecisionSubgraph({
      class_uris: captured.classUris,
      verb_iris: captured.verbIris,
      subject_uri: captured.subjectUri,
    })
      .then((live) => {
        if (!cancelled) {
          setData(buildCorridorData(routing, graphTrace, alternates, live));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routing?.about.uri, graphTrace.length, alternates.length]);

  if (!routing) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-600 font-mono text-sm"
        style={{ background: "#070c13" }}>
        No routing decision to map. Send a query.
      </div>
    );
  }
  if (loading && !data) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-500 font-mono text-sm gap-2"
        style={{ background: "#070c13" }}>
        <Loader2 className="w-4 h-4 animate-spin" /> reading live graph…
      </div>
    );
  }
  if (!data) return null;
  return <SpoCorridor data={data} />;
}
