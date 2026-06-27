import { Fragment } from "react";

/**
 * ProcessTopologyCard — renders a PROCESS_TOPOLOGY archetype as a
 * clean horizontal flow of node blocks connected by thin lines.
 *
 * Replaces the previous WorkflowCanvas/ReactFlow render (which was
 * cyberpunk-theatrical: circle triggers with pulse rings, glitch
 * hover effects, three-color palette). The new render matches the
 * ChartWidget's visual language:
 *
 *   - `glass-panel` container with `border-cyan-500/20`
 *   - Pulsing cyan dot + bold white title + small cyan subtitle
 *   - Geometric blocks, no circles
 *   - Footer info row matching the chart's SQL/engine line
 *
 * Color per node — TYPE-DRIVEN palette so the flow has visual
 * hierarchy without breaking the calm style. Same hex palette the
 * ChartWidget uses for multi-series bars (cyan / violet / pink /
 * lime / orange / yellow). Maps semantic role to color so a reader
 * sees the kind of step at a glance.
 *
 * Entry animation note (2026-06-26) — the per-node Framer Motion
 * slide-in was REMOVED because SemanticInterpreter's outer
 * RadarReveal wrapper shows content at +1100ms (after a phased
 * radar-line / vertical-expand / opacity-fade sequence), so my
 * inner 0-620ms slide animations all completed behind an invisible
 * mask. The radar reveal IS the entry animation. Inner static
 * layout + a noticeable HOVER lift is the right shape.
 */

interface ProcessNode {
  id: string;
  name?: string;
  type?: string;
  description?: string;
}

interface ProcessEdge {
  source: string;
  target: string;
  relation?: string;
  predicate?: string;
}

interface ProcessTopologyCardProps {
  subject_concept?: string;
  nodes: ProcessNode[];
  edges: ProcessEdge[];
}

/**
 * Type → color map. Uses the same palette as ChartWidget's
 * SERIES_COLORS so the visual language is consistent across the
 * registry. Falls back to cyan for unknown types — same accent the
 * rest of the UI uses, so unknown blends in calmly rather than
 * jumping out with a fake-distinct color.
 */
const TYPE_COLORS: Record<string, string> = {
  trigger: "#06b6d4", // cyan — start/entry
  start: "#06b6d4",
  validation: "#a78bfa", // violet — verification/check steps
  validate: "#a78bfa",
  check: "#a78bfa",
  action: "#f472b6", // pink — main work / mutation
  mutate: "#f472b6",
  notification: "#84cc16", // lime — send / emit
  notify: "#84cc16",
  emit: "#84cc16",
  decision: "#fb923c", // orange — gateways / branching
  gateway: "#fb923c",
  branch: "#fb923c",
  output: "#facc15", // yellow — terminal / sink
  sink: "#facc15",
  terminal: "#facc15",
};
const DEFAULT_NODE_COLOR = "#06b6d4";

function colorForNode(node: ProcessNode, isFirst: boolean): string {
  // First node default to cyan accent if no type provided (matches
  // the "Start" label semantic).
  if (!node.type) return isFirst ? "#06b6d4" : DEFAULT_NODE_COLOR;
  const key = node.type.toLowerCase().trim();
  return TYPE_COLORS[key] ?? DEFAULT_NODE_COLOR;
}

export function ProcessTopologyCard({
  subject_concept,
  nodes,
  edges,
}: ProcessTopologyCardProps) {
  if (!nodes || nodes.length === 0) {
    return (
      <div className="glass-panel p-6 my-4 border-cyan-500/20">
        <div className="flex flex-col items-center justify-center gap-2 py-12">
          <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
            Process topology empty
          </p>
          <p className="font-mono text-[9px] text-slate-500">
            no nodes were attached to this archetype
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      {/* Header — title row matches ChartWidget */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {subject_concept || "Process Topology"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          Process Topology · {nodes.length} step{nodes.length === 1 ? "" : "s"}
        </p>
      </div>

      {/* Flow — horizontal row of blocks with connectors. */}
      <div className="overflow-x-auto pb-2 custom-scrollbar">
        <div className="flex items-stretch gap-3 min-w-fit pt-1 pb-1">
          {nodes.map((node, i) => {
            const isFirst = i === 0;
            const nodeColor = colorForNode(node, isFirst);
            const nextNode = nodes[i + 1];
            const edge = nextNode
              ? edges.find(
                  (e) => e.source === node.id && e.target === nextNode.id
                ) ||
                edges.find((e) => e.source === node.id) ||
                null
              : null;
            const nextColor = nextNode
              ? colorForNode(nextNode, false)
              : nodeColor;

            return (
              <Fragment key={node.id}>
                <NodeBlock
                  node={node}
                  index={i}
                  isFirst={isFirst}
                  color={nodeColor}
                />
                {i < nodes.length - 1 && (
                  <Connector
                    label={edge?.relation || edge?.predicate}
                    fromColor={nodeColor}
                    toColor={nextColor}
                  />
                )}
              </Fragment>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Nodes:</span>
          <span>{nodes.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Edges:</span>
          <span>{edges.length}</span>
        </div>
      </div>
    </div>
  );
}

function NodeBlock({
  node,
  index,
  isFirst,
  color,
}: {
  node: ProcessNode;
  index: number;
  isFirst: boolean;
  color: string;
}) {
  return (
    <div
      className="flex flex-col shrink-0 group/node"
      style={{ "--node-color": color } as React.CSSProperties}
    >
      <div
        className="glass-panel-sm px-4 py-3 min-w-[160px] max-w-[200px] border transition-all duration-200 group-hover/node:-translate-y-1"
        style={{
          borderColor: `${color}33`, // 20% alpha at rest
          boxShadow: "none",
        }}
        // Hover effect lives in the style block via group-hover; the
        // glow + border-brighten are dynamic per node-color, so we
        // apply them via inline JS hover handlers below using a
        // stateful wrapper... Actually simpler: use Tailwind arbitrary
        // values via a class binding on the node-color CSS var. The
        // browser handles the transition.
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = `${color}80`;
          e.currentTarget.style.boxShadow = `0 0 24px -8px ${color}66`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = `${color}33`;
          e.currentTarget.style.boxShadow = "none";
        }}
      >
        <div className="flex items-center gap-2 mb-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span
            className="font-mono text-[9px] uppercase tracking-widest"
            style={{ color: `${color}99` }}
          >
            {isFirst ? "Start" : `Step ${index + 1}`}
          </span>
        </div>
        <div className="text-sm font-semibold text-white leading-tight mb-1">
          {node.name || node.id}
        </div>
        {(node.type || node.description) && (
          <div className="text-[10px] text-slate-400 font-mono leading-snug">
            {node.type ? node.type.toLowerCase() : node.description}
          </div>
        )}
      </div>
    </div>
  );
}

function Connector({
  label,
  fromColor: _fromColor,
  toColor,
}: {
  label?: string;
  fromColor: string;
  toColor: string;
}) {
  // Connector design history:
  //   v1 — SVG line, 1.5px stroke, 40-70% gradient opacity. Invisible.
  //   v2 — SVG line, 2px stroke, 75-95% gradient opacity. Still
  //        invisible to the user at normal viewing distance.
  //   v3 (current) — CSS div line + CSS triangle chevron, both fully
  //        opaque in the TARGET node's color. CSS rendering of solid
  //        elements at 2-3px against the dark slate background is
  //        reliably visible at any zoom level; gradient SVG strokes
  //        on small geometry weren't.
  //
  // The fromColor is preserved in the signature for future variants
  // (e.g. a midpoint blend) but the v3 line uses toColor only —
  // directional cue matches the chevron, simpler is better.
  return (
    <div className="flex flex-col items-center justify-center gap-1 shrink-0 self-center w-20">
      {label && (
        <span
          className="font-mono text-[9px] uppercase tracking-wider whitespace-nowrap truncate max-w-[80px]"
          style={{ color: `${toColor}cc` }}
        >
          {label}
        </span>
      )}
      {/* Line + triangle. The line is a solid div at 3px tall (so it
          gets a couple of physical pixels even at high DPR with
          subpixel rounding), 56px wide. The triangle is a classic
          CSS border-trick: 0-size element with transparent top/bottom
          borders and a 7px-wide left border in the target color. */}
      <div className="flex items-center">
        <div
          className="h-[3px] rounded-sm"
          style={{
            width: "56px",
            backgroundColor: toColor,
            opacity: 0.85,
          }}
        />
        <div
          className="w-0 h-0"
          style={{
            borderTop: "5px solid transparent",
            borderBottom: "5px solid transparent",
            borderLeft: `7px solid ${toColor}`,
            opacity: 0.95,
          }}
        />
      </div>
    </div>
  );
}
