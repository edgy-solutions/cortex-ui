import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatAmount } from "@/lib/formatAmount";
import { showMeasure } from "@/lib/showMeasure";
import { CellInspector } from "./CellInspector";
import {
  validateVarianceTree,
  depthBelow,
  countBelow,
  MAX_RENDER_DEPTH,
  type VarianceNode,
} from "./VarianceTree.contract";

/**
 * VARIANCE_TREE — a quantity decomposed into what produced it.
 *
 * A LIVE VIEW (ADR-0042). The nesting is the answer, not a rendering choice: a variance stated
 * without what produced it is a number nobody can act on.
 *
 * TWO TRUNCATIONS, KEPT APART. The producer reports why IT stopped on every node —
 * `leaf`, `explained`, `depth` — because a truncated tree that looks complete is the failure
 * that field exists to prevent. This card also stops, at MAX_RENDER_DEPTH, and that is a
 * different claim: the analysis went further, the card is not drawing it yet. Rendering them
 * as one "nothing further" line would tell the reader the analysis was shallower than it was —
 * the producer's own failure mode, reproduced by the renderer meant to honour it.
 *
 * IT KNOWS NO DOMAIN. "Control account", "work package", "variance" appear nowhere; `level`
 * and the entity names are the payload's.
 */

/** How the producer's stop reason reads to someone who did not write the engine. */
const STOP_LANGUAGE: Record<string, string> = {
  leaf: "nothing beneath this in the model",
  explained: "immaterial against the total — not drilled further",
  depth: "the analysis stopped here at its own depth limit",
};

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-amber-500/20">
      <div className="flex flex-col items-center justify-center gap-2 py-12">
        <p className="font-mono text-[10px] text-amber-400/80 uppercase tracking-widest">
          {scope ? `${scope} — nothing to draw` : "nothing to draw"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

function Node({
  node,
  depth,
  valueUnit,
  onInspect,
}: {
  node: VarianceNode;
  depth: number;
  valueUnit?: string;
  onInspect: (n: VarianceNode) => void;
}) {
  const kids = Array.isArray(node.contributors) ? node.contributors : [];
  const atRenderLimit = depth + 1 >= MAX_RENDER_DEPTH && kids.length > 0;
  // Opened by default down to the render limit: a decomposition the reader has to click open
  // is a decomposition they will not read, and the nesting is the answer.
  const [open, setOpen] = useState(!atRenderLimit);

  const share = typeof node.share_of_root === "number" ? node.share_of_root : null;
  const stop = typeof node.stop_reason === "string" ? node.stop_reason : "";
  // `decomposed` means the producer carried on, so it is not a stopping statement at all and
  // saying anything would be noise. Every other value IS a statement and is rendered — an
  // unknown one verbatim, never mapped onto a neighbour.
  const stopLine = stop && stop !== "decomposed" ? (STOP_LANGUAGE[stop] ?? stop) : "";

  return (
    <li>
      <div
        className="flex items-baseline gap-2 py-1"
        style={{ paddingLeft: depth * 14 }}
        data-variance-node
        data-depth={depth}
      >
        {kids.length > 0 ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-slate-600 hover:text-neon-cyan flex-shrink-0"
            aria-label={open ? `Collapse ${node.entity_name}` : `Expand ${node.entity_name}`}
          >
            <ChevronRight
              className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
            />
          </button>
        ) : (
          <span className="w-3 flex-shrink-0" />
        )}

        <button
          type="button"
          onClick={() => onInspect(node)}
          className="flex-1 min-w-0 text-left flex items-baseline gap-2 hover:bg-white/[.04] rounded px-1"
        >
          <span className="font-mono text-[9px] uppercase tracking-widest text-slate-600 flex-shrink-0">
            {node.level}
          </span>
          <span className="font-mono text-[12px] text-slate-200 truncate min-w-0 flex-1">
            {node.entity_name}
          </span>
          <span className="font-mono text-[12px] tabular-nums text-slate-300">
            {formatAmount(node.variance, valueUnit)}
          </span>
          {/* OF THE ROOT, and the label says so. Against its parent a small variance inside a
              small account can be half of it; against the root it is noise, and an unqualified
              "share" invites the reading that makes a trivial node look like the problem. */}
          <span className="font-mono text-[10px] text-slate-500 w-20 text-right tabular-nums">
            {share === null ? "—" : `${showMeasure(share * 100)}% of total`}
          </span>
        </button>
      </div>

      {/* THE PRODUCER'S OWN STOPPING STATEMENT. Never inferred from an empty contributor list:
          leaf, immaterial, and its-own-depth-limit are three different facts that produce the
          identical absence. */}
      {stopLine && (
        <p
          className="font-mono text-[9px] text-slate-500 pb-1"
          style={{ paddingLeft: depth * 14 + 24 }}
          data-stop-reason={stop}
        >
          {stopLine}
        </p>
      )}

      {/* THE REMAINDER THE PRODUCER DECLINED TO ENUMERATE. Contributors that do not sum to
          their parent is the arithmetic lie this engine is most likely to tell, so a node that
          carries a residual shows it rather than letting the children look complete. */}
      {typeof node.residual === "number" && (
        <p
          className="font-mono text-[9px] text-amber-400/70 pb-1"
          style={{ paddingLeft: depth * 14 + 24 }}
          data-residual
        >
          {node.residual_note ?? `unenumerated remainder ${formatAmount(node.residual, valueUnit)}`}
        </p>
      )}

      {kids.length > 0 && open && !atRenderLimit && (
        <ul>
          {kids.map((k) => (
            <Node
              key={k.entity_id || k.entity_name}
              node={k}
              depth={depth + 1}
              valueUnit={valueUnit}
              onInspect={onInspect}
            />
          ))}
        </ul>
      )}

      {/* THE CARD'S OWN LIMIT, said in the card's own voice and never as "nothing further".
          The analysis went deeper; this is a statement about the drawing, not the data. */}
      {atRenderLimit && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="font-mono text-[9px] text-neon-cyan/70 hover:text-neon-cyan pb-1"
          style={{ marginLeft: depth * 14 + 24 }}
          data-render-limit
        >
          {open ? "hide" : "show"} {countBelow(node)} more below, {depthBelow(node)} level
          {depthBelow(node) === 1 ? "" : "s"} deep
        </button>
      )}

      {kids.length > 0 && open && atRenderLimit && (
        <ul>
          {kids.map((k) => (
            <Node
              key={k.entity_id || k.entity_name}
              node={k}
              depth={depth + 1}
              valueUnit={valueUnit}
              onInspect={onInspect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function VarianceTree({
  rows,
  value_label,
  value_unit,
  scope_label,
  valid_as_of,
  state_version,
}: {
  rows: unknown;
  value_label?: string;
  value_unit?: string;
  scope_label?: string;
  valid_as_of?: string;
  state_version?: number;
}) {
  const [selected, setSelected] = useState<VarianceNode | null>(null);
  const result = validateVarianceTree(rows);
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }
  const root = result.root;

  return (
    <div className="glass-panel p-4">
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="w-1.5 h-1.5 rounded-full bg-neon-blue/80 flex-shrink-0" />
        <h3 className="font-semibold text-slate-100">Decomposition</h3>
        <span className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          {countBelow(root)} contributors · {depthBelow(root)} level
          {depthBelow(root) === 1 ? "" : "s"}
          {value_label ? ` · ${value_label}` : ""}
        </span>
      </div>

      <ul className="mt-3">
        <Node node={root} depth={0} valueUnit={value_unit} onInspect={setSelected} />
      </ul>

      <p className="mt-2 font-mono text-[9px] text-slate-500">
        shares are of the TOTAL, not of the parent
      </p>

      {selected && (
        <CellInspector
          onDismiss={() => setSelected(null)}
          title={
            <>
              {selected.level} · {selected.entity_name}
            </>
          }
          headline={
            <>
              {formatAmount(selected.variance, value_unit)}
              {typeof selected.share_of_root === "number" && (
                <span className="text-slate-400">
                  {" "}
                  · {showMeasure(selected.share_of_root * 100)}% of total
                </span>
              )}
            </>
          }
          lines={[
            typeof selected.bcws === "number" ? (
              <>
                BCWS {formatAmount(selected.bcws, value_unit)} · BCWP{" "}
                {formatAmount(selected.bcwp ?? NaN, value_unit)} · ACWP{" "}
                {formatAmount(selected.acwp ?? NaN, value_unit)}
              </>
            ) : null,
            selected.stop_reason && selected.stop_reason !== "decomposed" ? (
              <>{STOP_LANGUAGE[selected.stop_reason] ?? selected.stop_reason}</>
            ) : null,
            selected.residual_note ? (
              <span className="text-amber-400/80">{selected.residual_note}</span>
            ) : null,
          ]}
        />
      )}

      {(valid_as_of || state_version !== undefined) && (
        <p className="mt-3 font-mono text-[9px] text-slate-500">
          {valid_as_of && <>valid as of {valid_as_of}</>}
          {state_version !== undefined && <> · state v{state_version}</>}
        </p>
      )}
    </div>
  );
}
