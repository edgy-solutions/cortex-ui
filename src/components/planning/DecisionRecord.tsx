/**
 * DECISION_RECORD — a committed decision. Beat 6's card.
 *
 * NOT A LIVE VIEW, and it is the only planning card that is not. The others describe a plan
 * still moving and recompute against it; this describes AN ACT, at a time, by a named actor.
 * Recomputing it would let the record of what someone decided drift with the state they
 * decided against, which destroys the only property that makes it evidence. So `acted_at` is
 * rendered as a fact, never as a freshness stamp, and there is no re-evaluation path here.
 *
 * IT REFUSES A RECORD WITH NO RATIONALE RATHER THAN DRAWING IT. The ceremony blocks on an
 * empty reason at ACT time; if an artifact arrives without one, that block failed somewhere,
 * and drawing the card anyway would present an ungoverned decision in the exact visual
 * language of a governed one. Declining is how the card refuses to launder it.
 *
 * IT KNOWS NO DOMAIN. "Portfolio", "funding", "capex" appear in no branch — the ops carry
 * their own field names and this renderer prints keys and values it has never heard of.
 * GENERIC-AT-BIRTH, the INSTANCES_BY_PROPERTY precedent.
 *
 * ITS ACCEPTANCE RULES LIVE IN ITS CONTRACT. `validateDecisionRecord` is imported rather than
 * reimplemented — this component cannot enforce a rule the contract does not state.
 */
import {
  validateDecisionRecord,
  type DecisionAlternative,
} from "./DecisionRecord.contract";

export interface DecisionRecordProps {
  decision?: unknown;
  ops?: unknown;
  alternatives?: unknown;
  question_trail?: unknown;
  scope_label?: string;
}

function DeliberateEmpty({ reason, scope }: { reason: string; scope?: string }) {
  return (
    <div className="glass-panel p-6 my-4 border-slate-600/30">
      <div className="space-y-1">
        <p className="text-sm text-slate-400">
          {scope ? `${scope} — not a recordable decision` : "not a recordable decision"}
        </p>
        <p className="font-mono text-[9px] text-slate-500">{reason}</p>
      </div>
    </div>
  );
}

/** One op, printed from its own keys. The renderer knows none of them by name. */
function OpRow({ op }: { op: Record<string, unknown> }) {
  const entries = Object.entries(op).filter(([k]) => k !== "op");
  return (
    <li className="font-mono text-[11px] text-slate-300 flex flex-wrap gap-x-3">
      <span className="text-cyan-400">{String(op.op ?? "op")}</span>
      {entries.map(([k, v]) => (
        <span key={k} className="text-slate-400">
          {k}=<span className="text-slate-200">{String(v)}</span>
        </span>
      ))}
    </li>
  );
}

export function DecisionRecord({
  decision, ops, alternatives, question_trail, scope_label,
}: DecisionRecordProps) {
  const result = validateDecisionRecord({ decision, ops });
  if (result.kind === "empty") {
    return <DeliberateEmpty reason={result.reason} scope={scope_label} />;
  }

  const d = (decision ?? {}) as Record<string, unknown>;
  const alts = Array.isArray(alternatives) ? (alternatives as DecisionAlternative[]) : [];
  const trail = Array.isArray(question_trail)
    ? (question_trail as Record<string, unknown>[])
    : [];

  return (
    <div className="glass-panel p-6 my-4 border-emerald-500/20 relative overflow-hidden">
      <div className="mb-4">
        <div className="flex items-center gap-2 mb-1">
          {/* No pulse. Every other planning card animates because it is live; this one is
              settled, and the stillness is the difference being said visually. */}
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {scope_label || "Decision"}
          </h3>
        </div>
        <p className="text-[10px] text-emerald-400/70 uppercase tracking-[0.2em] font-mono font-bold">
          {String(d.decision ?? "recorded")} · {String(d.acted_by ?? "unknown")}
        </p>
      </div>

      {/* THE RATIONALE IS THE CARD'S REASON TO EXIST — first, and not truncated. */}
      <blockquote className="border-l-2 border-emerald-500/40 pl-3 mb-4">
        <p className="text-sm text-slate-200 italic">{String(d.comment ?? "")}</p>
      </blockquote>

      <div className="mb-4">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1">
          disposed ({result.ops.length})
        </p>
        <ul className="space-y-1">
          {result.ops.map((op, i) => (
            <OpRow key={i} op={op} />
          ))}
        </ul>
      </div>

      {/* EMPTY RENDERS, and says so. "No alternatives were considered" is a real statement
          about a decision — hiding the section would make it indistinguishable from a card
          that was never told. */}
      <div className="mb-4">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1">
          alternatives ({alts.length})
        </p>
        {alts.length === 0 ? (
          <p className="text-[11px] text-slate-500 font-mono">none recorded</p>
        ) : (
          <ul className="space-y-1">
            {alts.map((a, i) => (
              <li key={i} className="text-[11px] font-mono text-slate-300">
                <span className={a.considered ? "text-emerald-400" : "text-slate-500"}>
                  {a.considered ? "considered" : "not considered"}
                </span>{" "}
                {a.label}
                {a.note && <span className="text-slate-500"> — {a.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      {trail.length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-mono mb-1">
            question trail ({trail.length})
          </p>
          <ul className="space-y-1">
            {trail.map((q, i) => (
              <li key={i} className="text-[11px] font-mono text-slate-400">
                {String(q.q ?? q.question ?? "")}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* A FACT, not a freshness stamp. Labelled "acted" rather than "valid as of" so it
          cannot be read as the live-view stamp every sibling card carries. */}
      <p className="font-mono text-[9px] text-slate-500">
        acted {String(d.acted_at ?? "")} · requested by {String(d.requested_by ?? "")}
        {String(d.requested_by) === String(d.acted_by) && " (single approver)"}
      </p>
    </div>
  );
}
