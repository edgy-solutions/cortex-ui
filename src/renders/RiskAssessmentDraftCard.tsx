import { StructuredValue } from "@/archetypes/StructuredFields";
import { deepLinkPath } from "@/lib/deepLink";
import { arr, rec, str } from "./readers";

/**
 * RISK_ASSESSMENT_DRAFT — drawn from the safety engine's flat `draft_risk_assessment` reply
 * (`output_uri` .../safety#RiskAssessmentDraft). Verbatim values; nothing is formatted or inferred.
 */
/**
 * `verified_in_field` is a THREE-STATE STRING in the producer (entities.py `FieldVerification`:
 * "true" | "false" | "not_verified"), never a boolean. "false" is a FAILED field verification,
 * which measures.py's orphan rule reads differently from "never verified"; a value outside the
 * vocabulary is printed as it arrived rather than folded into either.
 */
function verifiedLabel(v: unknown): string {
  if (v === "true") return "verified in field";
  if (v === "false") return "field verification FAILED";
  if (v === "not_verified") return "not verified in field";
  const s = str(v);
  return s === undefined ? "verification not stated" : `verified_in_field: ${s}`;
}

export function RiskAssessmentDraftCard({ payload }: { payload: Record<string, unknown> }) {
  const hazardId = str(payload.hazard_id);
  const hazard = str(payload.hazard);
  const title = [hazardId, hazard].filter(Boolean).join(" — ");
  const subline = [str(payload.tail), str(payload.platform), str(payload.acceptance_status)]
    .filter(Boolean)
    .join(" · ");
  const citations = rec(payload.citations) ?? {};
  const matrix = str(citations.risk_level);
  const headline = `severity ${str(payload.severity) ?? "?"} · probability ${str(payload.probability) ?? "?"} → ${str(payload.risk_level) ?? "?"}`;

  const mitigations = arr(payload.mitigations).map(rec).filter((m): m is Record<string, unknown> => !!m);
  const orphanReason = str(payload.orphan_reason);

  const derived = arr(payload.derived_from);
  const citationKeys = Object.keys(citations).sort();

  const review = rec(payload.review_request);
  const audience = str(review?.audience) ?? str(payload.acceptance_audience);
  const caseId = str(review?.case_id) ?? str(payload.case_id);
  const taskId = str(review?.task_id);
  const note = str(payload.note);

  return (
    <div data-render="RISK_ASSESSMENT_DRAFT" className="glass-panel p-4 my-2 space-y-3 font-mono text-xs text-slate-200">
      <div>
        <div data-draft-title className="text-base font-bold text-white">
          {title}
        </div>
        {subline && <div className="text-[10px] text-slate-400">{subline}</div>}
      </div>

      <div data-draft-headline className="flex flex-wrap items-baseline gap-2 text-sm text-cyan-200">
        <span>{headline}</span>
        {matrix ? (
          <span data-draft-matrix-citation className="text-[10px] text-slate-400">
            {matrix}
          </span>
        ) : (
          <span data-draft-matrix-citation-missing className="text-[10px] text-amber-400">
            matrix citation not supplied
          </span>
        )}
      </div>

      <div data-draft-mitigations>
        {mitigations.length > 0 ? (
          <table className="w-full text-[11px]">
            <tbody>
              {mitigations.map((m, i) => (
                <tr key={`${str(m.mitigation_id) ?? "m"}-${i}`} data-draft-mitigation={str(m.mitigation_id)}>
                  <td className="pr-3">{str(m.mitigation_id)}</td>
                  <td className="pr-3">{str(m.owner)}</td>
                  <td data-draft-verified={str(m.verified_in_field) ?? ""}>{verifiedLabel(m.verified_in_field)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div>
            <span data-draft-orphan className="text-amber-400">
              none recorded {"—"} orphan
            </span>
          </div>
        )}
        {orphanReason && (
          <div data-draft-orphan-reason className="mt-1 text-[10px] text-amber-400">
            {orphanReason}
          </div>
        )}
      </div>

      <div data-draft-provenance className="space-y-1">
        <ul className="list-disc pl-4 text-[11px]">
          {derived.map((d, i) => (
            <li key={i}>{typeof d === "string" ? d : <StructuredValue value={d} />}</li>
          ))}
        </ul>
        <table className="text-[10px]">
          <tbody>
            {citationKeys.map((k) => (
              <tr key={k} data-draft-citation={k}>
                <td className="pr-2 text-slate-400">{k}</td>
                <td>
                  <StructuredValue value={citations[k]} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div data-draft-review className="space-y-0.5 text-[11px]">
        {str(review?.kind) && <div>{str(review?.kind)}</div>}
        {audience && <div>{`audience: ${audience}`}</div>}
        {str(review?.title) && <div>{str(review?.title)}</div>}
        {caseId ? (
          <a data-draft-case-link href={deepLinkPath({ kind: "case", caseId })} className="text-cyan-400 underline">
            {`open case ${caseId}`}
          </a>
        ) : (
          <div data-draft-case-pending className="text-slate-400">
            {`task ${taskId ?? "(no task id)"} · case not opened yet`}
          </div>
        )}
      </div>

      {note && (
        <div data-draft-note className="text-[10px] text-slate-400">
          {note}
        </div>
      )}
    </div>
  );
}
