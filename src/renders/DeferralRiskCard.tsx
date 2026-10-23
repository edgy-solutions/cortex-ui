import { num, str } from "./readers";

/**
 * DEFERRAL_RISK_CARD — drawn from the safety engine's flat `assess_deferral_risk` reply
 * (`output_uri` .../safety#DeferralRiskCard). `critical_items_checked` is load-bearing: an empty
 * answer and a completed check are different facts, so the count is never dropped silently.
 */
export function DeferralRiskCardRender({ payload }: { payload: Record<string, unknown> }) {
  const deferred = typeof payload.deferred === "boolean" ? payload.deferred : undefined;
  const reason = str(payload.deferred_reason);
  const deferral =
    deferred === true ? (reason ? `deferred: ${reason}` : "deferred") : deferred === false ? "not deferred" : "deferral not stated";
  const subline = [str(payload.tail), deferral].filter((x): x is string => x !== undefined);

  const critical = typeof payload.safety_critical === "boolean" ? payload.safety_critical : undefined;
  const checked = num(payload.critical_items_checked);
  const csi = str(payload.csi_id);
  const head =
    critical === true
      ? ["safety-critical", csi].filter((x): x is string => x !== undefined).join(" · ")
      : critical === false
        ? "not safety-critical"
        : "criticality not stated";

  const hazardId = str(payload.reopens_hazard_id);
  const status = str(payload.hazard_status);
  const statusPart = status ? ` (${status})` : "";
  // An unstated deferral is neither branch: "not re-opened" and "not stated" are opposite facts.
  const hazardLine =
    deferred === true
      ? `re-opens ${hazardId}${statusPart}`
      : deferred === false
        ? `its hazard ${hazardId}${statusPart} is not re-opened: the work order is not deferred`
        : `its hazard ${hazardId}${statusPart}: whether this deferral re-opens it is not stated`;
  const severity = str(payload.severity);
  const probability = str(payload.probability);
  const pair = [severity ? `severity ${severity}` : "", probability ? `probability ${probability}` : ""].filter((x) => x !== "");

  const assessment = str(payload.assessment);
  const assessmentText =
    assessment === "drafted"
      ? "DRAFTED: no risk level or acceptance is set here"
      : assessment === "not_applicable"
        ? "no assessment: nothing is re-opened"
        : assessment;
  const note = str(payload.note);

  return (
    <div data-render="DEFERRAL_RISK_CARD" className="glass-panel p-4 my-2 space-y-3 font-mono text-xs text-slate-200">
      <div data-drc-header>
        <div className="text-base font-bold text-white">
          {`work order ${str(payload.work_order_id) ?? ""} · part ${str(payload.part_number) ?? ""}`}
        </div>
        <div data-drc-subline className="text-[10px] text-slate-400">
          {subline.join(" · ")}
        </div>
      </div>

      <div data-drc-verdict data-drc-critical={critical === undefined ? "unknown" : String(critical)} className="text-[11px]">
        {head}
        {" · "}
        {checked !== undefined ? (
          `checked against ${checked} critical items`
        ) : (
          <span data-drc-count-missing className="text-amber-400">
            the number of items checked did not arrive
          </span>
        )}
      </div>

      {hazardId !== undefined && (
        <div data-drc-hazard className="text-[11px]">
          <div>{hazardLine}</div>
          {str(payload.reopens_hazard) && <div className="text-slate-400">{str(payload.reopens_hazard)}</div>}
          {pair.length > 0 && (
            <div data-drc-pair className="text-[10px] text-slate-400">
              {`${pair.join(" · ")} · carried from the hazard`}
            </div>
          )}
        </div>
      )}

      {assessmentText !== undefined && (
        <div data-drc-assessment data-drc-assessment-value={assessment} className="text-[11px]">
          {assessmentText}
        </div>
      )}

      {note && (
        <div data-drc-note className="text-[10px] text-slate-400">
          {note}
        </div>
      )}
    </div>
  );
}
