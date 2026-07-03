import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Loader2, Crown } from "lucide-react";
import {
  useCurrentRouting,
  useCurrentGraphTrace,
  useCurrentGraphAlternates,
} from "@/store/useCanvasStore";
import { fetchDecisionSubgraph } from "@/api/client";
import {
  collectCapturedDecision,
  buildMapModel,
  type MapModel,
  type NodeState,
} from "@/lib/decisionMap";

/**
 * DecisionMap — the spatial decision-path map (the "bigger picture").
 *
 * A drawn node/edge graph of the decision's neighborhood: the subClassOf
 * ancestor spine (vertical), the resolver losers (left offshoots), the
 * verb branches (right — taken solid, alternates dashed), and the answer
 * terminus. The CAPTURED decision is overlaid on a BOUNDED LIVE read and
 * their divergence is rendered as the feature's whole point.
 *
 * FOUR STATES, each visually UNAMBIGUOUS (see legend):
 *   matched (cyan, solid)      — traversed, still exists.
 *   ghost   (rose, dashed, ⌀)  — traversed but GONE now (staleness). NOT dim.
 *   dim     (faint gray)       — present now, not part of the decision.
 *   capturedOnly (amber)       — live read failed; whole map labeled
 *                                "cannot verify", never shown as current.
 *
 * FENCE: a rendered STATIC graph. Nodes show label/score/URI; they are NOT
 * clickable-to-browse-Neo4j (that interactive explorer stays deferred).
 */
export function DecisionMap() {
  const routing = useCurrentRouting();
  const graphTrace = useCurrentGraphTrace();
  const alternates = useCurrentGraphAlternates();
  const [model, setModel] = useState<MapModel | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!routing) {
      setModel(null);
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
        if (!cancelled) setModel(buildMapModel(captured, live));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // Re-fetch when the foregrounded decision changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routing?.about.uri, graphTrace.length, alternates.length]);

  if (!routing) {
    return (
      <div className="h-full w-full flex items-center justify-center text-slate-600 font-mono text-sm">
        No routing decision to map. Send a query.
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      {loading && !model && (
        <div className="flex-1 flex items-center justify-center text-slate-500 font-mono text-sm gap-2">
          <Loader2 className="w-4 h-4 animate-spin" /> reading live graph…
        </div>
      )}
      {model && (
        <>
          {!model.available && <CouldntCheckBanner reason={model.reason} />}
          <div className="flex-1 overflow-auto custom-scrollbar">
            <MapCanvas model={model} />
          </div>
          <Legend capturedOnly={!model.available} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// State → visual encoding. The one place the four states get their look;
// kept as a table so "ghost ≠ dim" is enforced in one glance.
// ---------------------------------------------------------------------------
interface StateStyle {
  stroke: string;
  fill: string;
  text: string;
  dash?: string;
  opacity: number;
}
const STATE_STYLE: Record<NodeState, StateStyle> = {
  matched: { stroke: "#22d3ee", fill: "#0e3a44", text: "#a5f3fc", opacity: 1 },
  ghost: { stroke: "#fb7185", fill: "transparent", text: "#fda4af", dash: "4 3", opacity: 0.7 },
  dim: { stroke: "#475569", fill: "transparent", text: "#64748b", opacity: 0.4 },
  capturedOnly: { stroke: "#f59e0b", fill: "transparent", text: "#fcd34d", dash: "2 3", opacity: 0.85 },
};

const NODE_W = 150;
const NODE_H = 34;
const ROW = 92; // vertical gap between spine nodes
const CX = 280; // spine column x (top-left of node)
const LOSER_X = 40;
const VERB_X = 500;

function MapCanvas({ model }: { model: MapModel }) {
  const spineCount = Math.max(model.spine.length, 1);
  const verbCount = model.verbs.length;
  const height = 80 + spineCount * ROW + Math.max(0, verbCount - 1) * 44 + 80;
  const width = VERB_X + NODE_W + 220;

  // Spine positions (subject at top, ancestors descending).
  const spineY = (i: number) => 50 + i * ROW;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${width} ${height}`}
      className="font-mono"
      style={{ minHeight: height }}
    >
      {/* subClassOf spine edges */}
      {model.spine.slice(1).map((n, i) => (
        <SpineEdge
          key={`se-${n.uri}`}
          x={CX + NODE_W / 2}
          y1={spineY(i) + NODE_H}
          y2={spineY(i + 1)}
          label="subClassOf"
        />
      ))}

      {/* losers: dashed offshoots to the LEFT of the subject */}
      {model.losers.map((l, i) => {
        const y = 50 + i * (NODE_H + 8);
        return (
          <g key={`loser-${l.uri}-${i}`}>
            <path
              d={`M ${LOSER_X + NODE_W} ${y + NODE_H / 2} L ${CX} ${spineY(0) + NODE_H / 2}`}
              stroke="#475569"
              strokeWidth={1}
              strokeDasharray="3 3"
              fill="none"
              opacity={0.5}
            />
            <MapNode
              x={LOSER_X}
              y={y}
              label={l.label}
              sub={typeof l.score === "number" ? `recall ${l.score.toFixed(2)}` : undefined}
              state={l.state}
              small
            />
          </g>
        );
      })}

      {/* verb branches: to the RIGHT — taken solid, alternates dashed */}
      {model.verbs.map((v, i) => {
        const y = spineY(0) + i * (NODE_H + 10);
        return (
          <g key={`verb-${v.outputUri}-${i}`}>
            <path
              d={`M ${CX + NODE_W} ${spineY(0) + NODE_H / 2} C ${CX + NODE_W + 90} ${spineY(0) + NODE_H / 2}, ${VERB_X - 90} ${y + NODE_H / 2}, ${VERB_X} ${y + NODE_H / 2}`}
              stroke={v.taken ? "#22d3ee" : "#64748b"}
              strokeWidth={v.taken ? 1.75 : 1}
              strokeDasharray={v.taken ? undefined : "5 4"}
              fill="none"
              opacity={v.taken ? 0.9 : 0.55}
            />
            <text
              x={CX + NODE_W + 96}
              y={((spineY(0) + NODE_H / 2) + (y + NODE_H / 2)) / 2 - 4}
              fontSize={9}
              fill={v.taken ? "#67e8f9" : "#64748b"}
              fontStyle="italic"
            >
              {v.taken ? `▸ ${v.verbLabel}` : v.verbLabel}
            </text>
            <MapNode x={VERB_X} y={y} label={v.outputLabel} state={v.state} />
          </g>
        );
      })}

      {/* the structural spine nodes (drawn last so they sit on top) */}
      {model.spine.map((n, i) => (
        <MapNode
          key={`spine-${n.uri}`}
          x={CX}
          y={spineY(i)}
          label={n.label}
          sub={
            n.isSubject && typeof model.winnerConfidence === "number"
              ? `conf ${model.winnerConfidence.toFixed(2)}`
              : undefined
          }
          state={n.state}
          crown={n.isSubject}
        />
      ))}

      {/* dim context nodes — small, faint, bottom band */}
      {model.context.slice(0, 8).map((c, i) => (
        <MapNode
          key={`ctx-${c.uri}`}
          x={40 + (i % 4) * 170}
          y={height - 70 + Math.floor(i / 4) * (NODE_H + 6)}
          label={c.label}
          state="dim"
          small
        />
      ))}
      {model.context.length > 0 && (
        <text x={40} y={height - 82} fontSize={9} fill="#475569">
          nearby now, not in this decision ({model.context.length})
        </text>
      )}
    </svg>
  );
}

function MapNode({
  x,
  y,
  label,
  sub,
  state,
  crown,
  small,
}: {
  x: number;
  y: number;
  label: string;
  sub?: string;
  state: NodeState;
  crown?: boolean;
  small?: boolean;
}) {
  const s = STATE_STYLE[state];
  const w = small ? 130 : NODE_W;
  return (
    <g opacity={s.opacity}>
      <rect
        x={x}
        y={y}
        width={w}
        height={NODE_H}
        rx={5}
        fill={s.fill}
        stroke={s.stroke}
        strokeWidth={1.5}
        strokeDasharray={s.dash}
      />
      {crown && (
        <g transform={`translate(${x + 6}, ${y + 6})`}>
          <Crown className="w-3 h-3" color={s.text} />
        </g>
      )}
      <text
        x={x + (crown ? 22 : 8)}
        y={y + (sub ? 14 : 21)}
        fontSize={11}
        fill={s.text}
        style={{ textDecoration: state === "ghost" ? "line-through" : undefined }}
      >
        {label.length > 18 ? label.slice(0, 17) + "…" : label}
      </text>
      {sub && (
        <text x={x + 8} y={y + 26} fontSize={8} fill={s.text} opacity={0.75}>
          {sub}
        </text>
      )}
      {state === "ghost" && (
        <text x={x + w - 4} y={y + 12} fontSize={8} fill={s.stroke} textAnchor="end">
          ⌀ gone
        </text>
      )}
    </g>
  );
}

function SpineEdge({ x, y1, y2, label }: { x: number; y1: number; y2: number; label: string }) {
  return (
    <g>
      <line x1={x} y1={y1} x2={x} y2={y2} stroke="#475569" strokeWidth={1.25} />
      <text x={x + 6} y={(y1 + y2) / 2 + 3} fontSize={9} fill="#64748b" fontStyle="italic">
        {label}
      </text>
    </g>
  );
}

function CouldntCheckBanner({ reason }: { reason: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="m-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-400 flex-shrink-0" />
        <div>
          <div className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-300">
            Current graph state unavailable
          </div>
          <p className="text-[11px] font-mono text-slate-400 leading-snug">
            Showing the captured decision path only — <b>cannot verify what has
            changed</b> in the live graph. Nodes are historical, not confirmed
            current. ({reason})
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function Legend({ capturedOnly }: { capturedOnly: boolean }) {
  const items: { state: NodeState; label: string }[] = capturedOnly
    ? [{ state: "capturedOnly", label: "captured, unverified (live read failed)" }]
    : [
        { state: "matched", label: "traversed · still exists" },
        { state: "ghost", label: "traversed · GONE now (changed since)" },
        { state: "dim", label: "present now · not in this decision" },
      ];
  return (
    <div className="shrink-0 flex flex-wrap gap-4 px-4 py-2 border-t border-white/5 bg-slate-950/40">
      {items.map((it) => {
        const s = STATE_STYLE[it.state];
        return (
          <div key={it.state} className="flex items-center gap-1.5">
            <svg width={18} height={12}>
              <rect
                x={1}
                y={1}
                width={16}
                height={10}
                rx={2}
                fill={s.fill}
                stroke={s.stroke}
                strokeWidth={1.5}
                strokeDasharray={s.dash}
                opacity={s.opacity}
              />
            </svg>
            <span className="text-[9px] font-mono text-slate-500">{it.label}</span>
          </div>
        );
      })}
      <span className="text-[9px] font-mono text-slate-600 ml-auto italic">
        taken path solid · alternates dashed · from captured decision + live graph
      </span>
    </div>
  );
}
