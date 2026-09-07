import { Lock } from "lucide-react";
import { validateNamedHole } from "./NamedHole.contract";

/**
 * The named hole — a card that is PRESENT and says why it is empty.
 *
 * ── WHY IT IS DRAWN AS A CARD AND NOT AS A GAP ────────────────────────────────────────────
 *
 * Blank already means something here, by design: the interpretation strip renders nothing when
 * no interpretation was captured, so that a placeholder cannot occupy the space where a real
 * claim belongs. A hole drawn as a faded box would land in exactly that vocabulary and read as
 * "nothing was captured" — when the truth is "something is here and you may not have it". Those
 * are opposite facts. So this has a border, an icon and a sentence, and looks like a card that
 * is doing its job rather than one that failed to load.
 *
 * ── IT SAYS ONLY WHAT IT WAS TOLD ─────────────────────────────────────────────────────────
 *
 * ADR-0050 §5 FLAGS AND DOES NOT RULE whether the hole may name the verb it could not invoke —
 * that disclosure is a per-classification policy on the enforcement overlay. So every specific
 * here is the producer's: the panel's name if they sent one, the reason if they sent one, the
 * verb only if they sent it. With none of them, the card still says the one thing that is
 * always true and always the reader's to know — a panel is missing and it is missing because of
 * who is asking, not because the board is broken.
 */
export function NamedHole({ component }: { component: unknown }) {
  const result = validateNamedHole(component);
  if (result.kind === "empty") {
    // NOT DRAWN GENEROUSLY. `unavailable` belongs to the whole-board refusal and `empty`
    // belongs to the panel's own rowless card; drawing either here erases the distinction
    // ADR-0049 Ruling 4 exists to make.
    return null;
  }
  const hole = result.hole;

  return (
    <div
      className="glass-panel p-5 my-4 border-amber-500/25 bg-amber-500/[.03]"
      data-named-hole
      data-hole-disposition={hole.disposition}
    >
      <div className="flex items-start gap-3">
        <Lock className="w-4 h-4 text-amber-400/80 flex-shrink-0 mt-0.5" />
        <div className="min-w-0">
          <h3 className="font-mono text-sm text-amber-200/90 tracking-tight">
            {/* THE PANEL'S NAME ONLY IF THE PRODUCER SENT ONE. Naming it is precisely the
                disclosure a compartmented classification may withhold, and inventing a name
                would decide an emission policy two ADRs left open. */}
            {hole.panelLabel ? (
              <>
                <span data-hole-panel>{hole.panelLabel}</span>
                <span className="text-amber-200/60"> — not available to you</span>
              </>
            ) : (
              "A panel here is not available to you"
            )}
          </h3>
          <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-slate-400">
            {/* THE PRODUCER'S WORDS, VERBATIM. Absent is a policy outcome rather than a gap, so
                the fallback states the fact without adding one: this is about entitlement, and
                the board is intact. */}
            {hole.reason ? (
              <span data-hole-reason>{hole.reason}</span>
            ) : (
              <span data-hole-reason="">
                Your grants do not cover it. The board is complete — this card is where that
                panel would be.
              </span>
            )}
          </p>
          {hole.verbIri && (
            <p className="mt-2 font-mono text-[9px] uppercase tracking-widest text-slate-600">
              <span data-hole-verb>{hole.verbIri}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
