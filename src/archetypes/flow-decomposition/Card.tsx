import { useEffect, useMemo, useRef, useState } from "react";
import { Sankey, Tooltip } from "recharts";
import { StructuredFields } from "@/archetypes/StructuredFields";
import { SIGN_NEGATIVE, SIGN_POSITIVE } from "@/lib/chartPalette";
import { FLOW_REFUSAL_WORDS, readFlowTable, type FlowSign, type FlowTable } from "./contract";
import { buildFlowGraph, hoverFor, signedText, type DrawnNode, type FlowGraph } from "./model";

/**
 * FLOW_DECOMPOSITION — a total flowing into its parts, left to right (contract.ts says what the
 * table is and when it is refused; model.ts decides what is drawn).
 *
 * ── NOT ONLY IN COLOUR ──────────────────────────────────────────────────────────────────────
 * Nodes and bands take their TARGET's sign colour, but the sign is also in every label (`+`/`−`
 * and the signed figure), in `data-flow-sign`, and on hover in words. Colour is a direction, never
 * good or bad.
 *
 * ── CLICK A NODE TO FOCUS ITS SUBTREE ───────────────────────────────────────────────────────
 * View state only. The focused node becomes the left-most column, and a breadcrumb above the chart
 * walks back. A leaf, a sink, or a pass-through does nothing when clicked.
 */

const SIGN_COLOUR: Record<FlowSign, string> = {
  positive: SIGN_POSITIVE,
  negative: SIGN_NEGATIVE,
  // Never drawn (zero draws no band); present so the record is total over the closed list.
  zero: "#94a3b8",
};

const DEFAULT_WIDTH = 900;
const MARGIN = { top: 8, right: 8, bottom: 8, left: 8 } as const;

/** Container width when the browser can say; a fixed width otherwise, so the chart always has a number. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}

function chartHeight(graph: FlowGraph): number {
  const perColumn = new Map<number, number>();
  for (const n of graph.nodes) perColumn.set(n.depth, (perColumn.get(n.depth) ?? 0) + 1);
  const tallest = Math.max(...perColumn.values());
  return Math.min(720, Math.max(280, tallest * 44));
}

function Refusal({ reason, detail, fields }: { reason: keyof typeof FLOW_REFUSAL_WORDS; detail: string; fields: Record<string, unknown> }) {
  return (
    <div className="glass-panel p-4 my-4 border-amber-500/20 flex flex-col gap-3">
      <div data-flow-refusal={reason} className="flex flex-col gap-1">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">nothing to draw — {FLOW_REFUSAL_WORDS[reason]}</p>
        <p className="font-mono text-[10px] text-amber-400/80">{detail}</p>
      </div>
      <StructuredFields fields={fields} archetype="FLOW_DECOMPOSITION" notDrawn={FLOW_REFUSAL_WORDS[reason]} />
    </div>
  );
}

function HoverContent({ table, active, payload }: { table: FlowTable; active?: boolean; payload?: { payload?: { key?: string } }[] }) {
  const key = payload?.[0]?.payload?.key;
  const hover = active && key !== undefined ? hoverFor(table, key) : undefined;
  if (!hover) return null;
  return (
    <div className="rounded border border-white/10 bg-black/80 p-2 font-mono text-[10px] text-slate-200 flex flex-col gap-0.5">
      <span className="text-slate-100">{hover.title}</span>
      {hover.valueLabel !== undefined && <span className="text-slate-400">{hover.valueLabel}</span>}
      <span>{hover.value}</span>
      <span className="text-slate-400">{hover.signWords}</span>
      {hover.zeroList !== undefined && <span className="text-slate-400">{hover.zeroList}</span>}
      {hover.sink !== undefined && <span className="text-slate-400">{hover.sink}</span>}
    </div>
  );
}

export function FlowDecomposition(props: Record<string, unknown>) {
  const read = useMemo(() => readFlowTable(props), [props]);
  const [focus, setFocus] = useState<string | null>(null);
  const [ref, width] = useWidth();

  const graph = useMemo(() => (read.ok ? buildFlowGraph(read, focus) : undefined), [read, focus]);

  if (!read.ok) return <Refusal reason={read.refusal} detail={read.detail} fields={props} />;
  const table = read;
  const g = graph as FlowGraph;
  const unit = table.unit;

  const onClick = (item: { payload?: { key?: string; passthrough?: boolean; clickable?: boolean } }, type: string) => {
    const node = item.payload;
    if (type !== "node" || !node || node.passthrough || node.key === undefined) return;
    if (node.key === g.focusKey) setFocus(null);
    else if (node.clickable) setFocus(node.key);
  };

  const Node = (p: { x: number; y: number; width: number; height: number; payload: DrawnNode }) => {
    const n = p.payload;
    if (n.passthrough) return <g data-flow-passthrough={n.label} />;
    const colour = SIGN_COLOUR[n.sign];
    const lastColumn = n.depth === g.maxDepth && g.maxDepth > 0;
    const tx = lastColumn ? p.x - 6 : p.x + p.width + 6;
    const anchor = lastColumn ? "end" : "start";
    const sink = n.kind === "other";
    return (
      <g
        data-flow-node={n.path.join(" / ")}
        data-flow-sign={n.sign}
        {...(sink ? { "data-flow-sink": "" } : {})}
        style={{ cursor: n.clickable || n.key === g.focusKey ? "pointer" : "default" }}
      >
        <rect
          x={p.x}
          y={p.y}
          width={p.width}
          height={Math.max(p.height, 1)}
          fill={colour}
          fillOpacity={0.9}
          stroke={sink ? "#e2e8f0" : "none"}
          strokeDasharray={sink ? "3 2" : undefined}
        />
        <text x={tx} y={p.y + p.height / 2 - 3} textAnchor={anchor} fontSize={11} fill="#e2e8f0" stroke="#050810" strokeWidth={3} paintOrder="stroke">
          {n.label}
        </text>
        <text x={tx} y={p.y + p.height / 2 + 10} textAnchor={anchor} fontSize={10} fill="#cbd5e1" stroke="#050810" strokeWidth={3} paintOrder="stroke">
          {signedText(n.sign, n.amount, unit)}
        </text>
      </g>
    );
  };

  const Link = (p: {
    sourceX: number;
    targetX: number;
    sourceY: number;
    targetY: number;
    sourceControlX: number;
    targetControlX: number;
    linkWidth: number;
    payload: { sign: FlowSign; key: string; passthrough: boolean };
  }) => {
    const l = p.payload;
    const path = (JSON.parse(l.key) as string[]).join(" / ");
    return (
      <path
        data-flow-link={path}
        data-flow-sign={l.sign}
        {...(l.passthrough ? { "data-flow-passthrough": path } : {})}
        d={`M${p.sourceX},${p.sourceY} C${p.sourceControlX},${p.sourceY} ${p.targetControlX},${p.targetY} ${p.targetX},${p.targetY}`}
        fill="none"
        stroke={SIGN_COLOUR[l.sign]}
        strokeWidth={p.linkWidth}
        strokeOpacity={0.35}
      />
    );
  };

  const header = [table.valueLabel, unit !== undefined ? `(${unit})` : undefined].filter((s) => s !== undefined).join(" ");
  const drawable = g.links.length > 0;

  return (
    <div data-archetype="FLOW_DECOMPOSITION" className="glass-panel p-4 my-4 flex flex-col gap-2">
      {header !== "" && <h3 className="font-semibold text-slate-100">{header}</h3>}
      {table.verdict !== undefined && (
        <p data-flow-verdict className="text-xs text-slate-300">
          {table.verdict}
        </p>
      )}
      <nav data-flow-crumbs aria-label="Focus" className="flex flex-wrap items-center gap-1 font-mono text-[10px] text-slate-400">
        {g.crumbs.map((c, i) => (
          <span key={c.key} className="flex items-center gap-1">
            {i > 0 && <span aria-hidden>/</span>}
            <button
              type="button"
              data-flow-crumb={c.label}
              aria-current={c.key === g.focusKey ? "true" : undefined}
              className="underline decoration-dotted hover:text-slate-100"
              onClick={() => setFocus(i === 0 ? null : c.key)}
            >
              {c.label}
            </button>
          </span>
        ))}
      </nav>
      {table.notes.map((n, i) => (
        <p key={`${n.kind}-${i}`} data-flow-note={n.kind} className="font-mono text-[10px] text-amber-400/80">
          {n.text}
        </p>
      ))}
      <div ref={ref} className="w-full overflow-x-auto">
        {drawable ? (
          <Sankey
            width={width}
            height={chartHeight(g)}
            data={{ nodes: g.nodes, links: g.links }}
            align="left"
            nodeWidth={10}
            nodePadding={16}
            margin={MARGIN}
            node={Node as never}
            link={Link as never}
            onClick={onClick as never}
          >
            <Tooltip content={<HoverContent table={table} />} />
          </Sankey>
        ) : (
          <p data-flow-empty className="font-mono text-[10px] text-slate-500">
            nothing beneath this node is drawn
          </p>
        )}
      </div>
    </div>
  );
}
