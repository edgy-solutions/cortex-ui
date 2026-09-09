import { useRegistrationStore } from "@/store/useRegistrationStore";

/**
 * DO THE TWO HALVES AGREE ABOUT WHAT CAN BE DRAWN — the signal the shas cannot give.
 *
 * The build stamp beside this says what is DEPLOYED. It cannot say whether this client and the
 * mesh agree about which archetypes exist, because that is established at runtime by the
 * ADR-0017 registration and can fail with both halves perfectly up to date.
 *
 * ── WHY IT IS WORTH A PLACE IN THE HEADER ─────────────────────────────────────────────────
 *
 * `sent != accepted` means the server kept fewer capability rows than this client offered, so
 * some later answer selects from a shorter menu and draws a PLAUSIBLE WRONG CARD. Nothing
 * throws, nothing is blank, and the reader has no way to know. That is the failure shape this
 * codebase keeps finding to be the least likely to get investigated, and it has lived its whole
 * life as a console line — read by whoever thinks to open the console, which is nobody at the
 * moment the wrong card is on screen.
 *
 * ── QUIET WHEN IT AGREES, AND NOT A TRAFFIC LIGHT ─────────────────────────────────────────
 *
 * Agreement is the state 99% of the time and gets the same muted slate as the shas beside it.
 * Only a disagreement takes colour. A badge that glowed green on every ordinary day would be
 * one more thing to stop seeing, and then it would not be noticed on the day it changed —
 * which is the same argument as not colouring the two shas when they differ.
 *
 * The counts are always shown, in both states. "24/24" is what makes "23/24" legible at a
 * glance the day it happens; a badge that showed nothing until something was wrong gives the
 * reader no idea what normal looks like.
 */
export function CapabilityBadge() {
  const status = useRegistrationStore((s) => s.status);
  const sent = useRegistrationStore((s) => s.sent);
  const accepted = useRegistrationStore((s) => s.accepted);

  // The four states say four different things, and never share a rendering — `partial` and
  // `failed` are the pair most tempting to fold, and they have opposite repairs: find which row
  // the server refused, versus retry a request that never landed.
  const label =
    status === "idle"
      ? "caps …"
      : status === "failed"
        ? "caps not registered"
        : `caps ${accepted}/${sent}`;

  const tone =
    status === "partial" || status === "failed" ? "text-amber-400/80" : "text-slate-600";

  const title =
    status === "idle"
      ? "Capability registration has not been attempted yet this session."
      : status === "failed"
        ? "The capability registration request did not succeed, so nothing was established " +
          "either way. The mesh may be using a stale menu for this surface. Retry is the repair."
        : status === "partial"
          ? `This client offered ${sent} capability rows and the server kept ${accepted}. ` +
            "The two halves disagree about what can be rendered, so an answer may select from " +
            "a shorter menu and draw a plausible but wrong card. Compare the names in the " +
            "console line against the graph — the count alone cannot say WHICH row."
          : `This client offered ${sent} capability rows and the server kept all of them. ` +
            "The halves agree about what can be rendered.";

  return (
    <span
      className={`font-mono text-[9px] tracking-wider select-text ${tone}`}
      data-capability-badge
      data-capability-status={status}
      title={title}
    >
      {label}
    </span>
  );
}
