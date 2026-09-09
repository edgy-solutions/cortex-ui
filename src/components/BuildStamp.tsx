import { useEffect, useState } from "react";
import { buildVersion, shortSha } from "@/lib/buildVersion";
import { fetchBffVersion, type BffVersionResult } from "@/api/client";

/**
 * WHAT IS SERVING, WHERE A PERSON CAN SEE IT.
 *
 * "Is the thing in front of me the thing that was pushed" has cost real minutes and at least
 * one wrong answer, and the only way to ask was to open Rancher — which reports what the
 * orchestrator ASKED for, not what is being served. Two shas beside MESH ONLINE: this bundle's,
 * and the BFF's own from `/fleet/version`.
 *
 * ── NOT FOR COMPARING THEM ────────────────────────────────────────────────────────────────
 *
 * cortex-ui is a separate repository with its own head and its own roll, so these two shas are
 * not comparable and nothing here diffs them or colours a mismatch. "Each thing is the thing
 * that was pushed" is the property; "everything matches" is a different claim and a false one.
 * A red dot on a legitimate difference would train everybody to ignore the row.
 *
 * The compatibility question — do the two halves agree about what can be RENDERED — is answered
 * by the registration count, not by shas, and it is a separate signal for that reason.
 *
 * ── FOUR STATES, BECAUSE THERE ARE FOUR ───────────────────────────────────────────────────
 *
 * This shipped with two — a sha, or "unreachable" for everything else — and the first person to
 * look at it caught the collapse immediately. The BFF was UP and serving picks; it had 404'd an
 * endpoint it does not have yet, and the row called that unreachable. "The service is down" and
 * "the service has not been rolled" have opposite repairs and nothing to do with each other.
 *
 *   a sha         it answered, and reports its build
 *   no /version   it answered; the endpoint is not there yet. Roll the backend.
 *   no sha        it answered and has the endpoint; that build was not stamped.
 *   unreachable   nothing came back at all. NOW the word is true, and only now.
 *
 * The value of the last one is entirely in how rarely it is right. A label covering four
 * situations is not a label, it is a shrug — and the next person to read "unreachable" would
 * have gone hunting for a service that was working perfectly.
 *
 * Absence is SAID in every case rather than left blank: an empty slot makes the row look like
 * it answered when it did not, the same failure as a duration drawing as absent when it was
 * really refused.
 */

/** What the BFF slot says, given what came back. Pure, so every state can be asserted. */
export function bffLabel(r: BffVersionResult | null): string {
  if (r === null) return "…";
  switch (r.kind) {
    case "ok":
      // Answered and has the endpoint. A missing sha HERE is an unstamped build — a third fact
      // again, and not worth collapsing into either neighbour.
      return shortSha(r.version.git_sha ?? null) ?? "no sha";
    case "no_endpoint":
      // The state that was being called "unreachable". It names the repair by naming the fact.
      return "no /version";
    case "error":
      // Neither down nor missing: it replied, and the reply was a failure. The status is the
      // only actionable thing there is, so the status is what is shown.
      return `/version ${r.status}`;
    case "unreachable":
      return "unreachable";
  }
}

/** The long form, for the tooltip — the same four states said in words. */
function bffDetail(r: BffVersionResult | null): string {
  if (r === null) return "checking…";
  switch (r.kind) {
    case "ok":
      return r.version.git_sha ?? "answered; that build recorded no sha";
    case "no_endpoint":
      return "answered, but has no /version endpoint yet — roll the backend";
    case "error":
      return `answered with HTTP ${r.status}`;
    case "unreachable":
      return "did not answer at all";
  }
}

export function BuildStamp() {
  const mine = buildVersion();
  const [bff, setBff] = useState<BffVersionResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBffVersion().then((r) => {
      if (cancelled) return;
      setBff(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const ui = shortSha(mine.git_sha);

  return (
    <span
      className="font-mono text-[9px] text-slate-600 tracking-wider select-text"
      data-build-stamp
      title={
        `cortex-ui ${mine.git_sha ?? "sha not recorded at build time"}` +
        (mine.built_at ? ` · built ${mine.built_at}` : "") +
        `\ncortex-bff ${bffDetail(bff)}` +
        "\nSeparate repositories — these are not meant to match."
      }
    >
      <span data-build-stamp-ui>ui {ui ?? "no sha"}</span>
      <span className="text-slate-700"> · </span>
      <span data-build-stamp-bff>bff {bffLabel(bff)}</span>
    </span>
  );
}
