import { useState } from "react";
import { ShieldAlert, Loader2, Check } from "lucide-react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { createAccessRequest } from "@/api/client";

/**
 * AccessDeniedCard — Bug 2 answer surface for a data-plane ACCESS DENIAL.
 *
 * Renders when the in-flight turn hit the can_read gate's 403 (the gateway's
 * typed `access_denied` SSE event → useInterviewStore.accessDenial). This is
 * DELIBERATELY not an empty chart and not a generic error: a denial is an
 * authorization OUTCOME, and the honest surface names it and offers the ONE
 * legitimate next action — request access (the deny→request→grant→allow loop).
 *
 * The "Request access" button reuses the sealed Slice-3 substrate via
 * createAccessRequest: it creates an async request HumanTask routed to the
 * domain's approvers and returns immediately (no suspend — the DoS ruling for
 * query denials). The grant subject is derived server-side from authz_id; we
 * send only the asset URN + domain, so the client can't spoof a subject.
 */
export function AccessDeniedCard() {
  const denial = useInterviewStore((s) => s.accessDenial);
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">(
    "idle",
  );
  const [errMsg, setErrMsg] = useState<string>("");
  const [requestId, setRequestId] = useState<string>("");

  if (!denial) return null;

  // The specific asset the request is for. The gate denies per-asset, so we
  // request the first denied asset (the one that blocked this turn). Domain
  // selects the approver audience (access_grant:<domain>).
  const asset = denial.denied_assets[0] ?? "";
  const domain = denial.domain;
  // Only the asset is required to request access — an absent domain falls back
  // to the backend's default approver audience (see createAccessRequest).
  const canRequest = Boolean(asset);

  async function onRequest() {
    if (!canRequest) return;
    setState("sending");
    setErrMsg("");
    try {
      const res = await createAccessRequest({
        asset,
        domain,
        reason: "Requested from an access-denied answer.",
      });
      setRequestId(res.request_id);
      setState("sent");
    } catch (e) {
      setErrMsg(e instanceof Error ? e.message : String(e));
      setState("error");
    }
  }

  // Short, human label for the denied asset (URN tail) without losing the URN
  // in a title tooltip for the curious.
  const assetLabel = asset ? asset.split(",").slice(-2, -1)[0] || asset : "";

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/[0.06] p-3 overflow-hidden">
      <div className="flex items-center gap-2 mb-1.5">
        <ShieldAlert className="w-3.5 h-3.5 text-amber-400 flex-shrink-0" />
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider text-amber-300">
          Access denied
        </span>
        {denial.domain && (
          <span className="ml-auto text-[9px] font-mono uppercase tracking-wider text-amber-400/60 tabular-nums flex-shrink-0">
            {denial.domain}
          </span>
        )}
      </div>

      <p className="text-[11px] font-mono leading-relaxed text-slate-300 mb-2">
        {denial.message ||
          "You don't have access to the data needed to answer this."}
      </p>

      {assetLabel && (
        <p
          className="text-[10px] font-mono text-slate-500 truncate mb-2.5"
          title={asset}
        >
          <span className="text-slate-600">Asset · </span>
          {assetLabel}
        </p>
      )}

      {/* Action: request access (reuses the sealed Slice-3 request flow). */}
      {state === "sent" ? (
        <div className="flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
          <Check className="w-3 h-3 flex-shrink-0" />
          <span className="truncate" title={requestId}>
            Access requested — pending approval
          </span>
        </div>
      ) : (
        <button
          type="button"
          onClick={onRequest}
          disabled={!canRequest || state === "sending"}
          className="inline-flex items-center gap-1.5 rounded-md border border-amber-500/50 bg-amber-500/10 px-2.5 py-1 text-[10px] font-mono font-medium text-amber-200 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state === "sending" && (
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
          )}
          {state === "sending" ? "Requesting…" : "Request access"}
        </button>
      )}

      {state === "error" && (
        <p className="mt-1.5 text-[9px] font-mono text-rose-400/80 truncate" title={errMsg}>
          Request failed — {errMsg}
        </p>
      )}
    </div>
  );
}
