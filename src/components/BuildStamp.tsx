import { useEffect, useState } from "react";
import { buildVersion, shortSha } from "@/lib/buildVersion";
import { fetchBffVersion } from "@/api/client";

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
 * ── ABSENCE IS SAID, NOT LEFT BLANK ───────────────────────────────────────────────────────
 *
 * A build with no sha and a BFF that could not be reached are DIFFERENT facts, and neither is
 * "nothing to report". Rendering an empty slot for either would make the row look like it had
 * answered when it had not — the same failure as a duration that draws as absent when it was
 * really refused. Each says which it is, in words that cannot be mistaken for a hash.
 */
export function BuildStamp() {
  const mine = buildVersion();
  const [bff, setBff] = useState<{ sha: string | null; reached: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchBffVersion().then((v) => {
      if (cancelled) return;
      // REACHED-WITH-NO-SHA AND NOT-REACHED ARE DIFFERENT STATES, and they have different
      // repairs: the first is a build that was not stamped, the second is a service that is
      // not answering. Folding them into one blank is the collapse this codebase keeps
      // finding — `None` for could-not-reach against `{}` for reached-and-empty.
      setBff(v ? { sha: v.git_sha ?? null, reached: true } : { sha: null, reached: false });
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
        `\ncortex-bff ${bff === null ? "checking…" : !bff.reached ? "unreachable" : (bff.sha ?? "sha not recorded at build time")}` +
        "\nSeparate repositories — these are not meant to match."
      }
    >
      <span data-build-stamp-ui>ui {ui ?? "no sha"}</span>
      <span className="text-slate-700"> · </span>
      <span data-build-stamp-bff>
        bff{" "}
        {bff === null ? "…" : !bff.reached ? "unreachable" : (shortSha(bff.sha) ?? "no sha")}
      </span>
    </span>
  );
}
