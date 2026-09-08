import type { Artifact } from "@/api/types";
import { validateAsk, type AskCardPayload } from "@/components/elicitation/Elicitation.contract";

/**
 * WHAT WAS ASKED, AND WHAT WAS PICKED — read once, for every surface that shows it.
 *
 * Two places display this: the decision path's "asked first" line, and the answer card's
 * collapsed offer. They were reading it DIFFERENTLY, and the difference was visible on screen:
 * the decision path took the pick from `answered_with` alone, which is what THIS BROWSER sent
 * and does not survive a reload — so after one it showed the question with no answer beside it,
 * while the card beneath it showed both.
 *
 * ── THE ORDER OF PREFERENCE IS THE POINT ──────────────────────────────────────────────────
 *
 * `accepted_slots` is the PRODUCER's account of what actually reached the verb. `answered_with`
 * is the client's account of what it asked for. They can disagree — a bound slot the server
 * refuses is exactly the case worth seeing — and the server's is the one that describes the
 * answer on screen, so it decides the VALUE.
 *
 * The client's is still worth having for the LABEL: the server carries `C8`, and "Analytics &
 * Reporting" is what the reader actually clicked. The menu resolves that when it is present, and
 * the client's record is the fallback for a label the menu no longer lists.
 */
export interface AskedPick {
  slot: string;
  /** What the reader saw. Falls back to the id when no label can be recovered. */
  label: string;
  /** The id it stands for. Empty when nothing recorded one. */
  value: string;
}

/** The ask a parent artifact carries, or null when it carries none. */
export function readAskOf(parent: Artifact | null | undefined): AskCardPayload | null {
  if (!parent) return null;
  const comp = (parent.rendered_output?.components ?? []).find(
    (c) =>
      typeof c === "object" &&
      c !== null &&
      (c as Record<string, unknown>).archetype === "ELICITATION",
  );
  const result = validateAsk(comp);
  return result.kind === "ok" ? result.ask : null;
}

/**
 * The pick an answer records against its ask, or null when neither side recorded one.
 *
 * NULL IS A REAL ANSWER AND IS NOT THE SAME AS AN EMPTY LABEL. A re-spoken ask binds nothing,
 * so there is no pick to show and the surfaces must say only what was asked.
 */
export function readPick(answer: Artifact | null | undefined, ask: AskCardPayload): AskedPick | null {
  if (!answer) return null;
  const accepted = answer.resolved_intent?.accepted_slots?.[ask.slot];
  const value =
    (typeof accepted === "string" ? accepted.trim() : "") || answer.answered_with?.value?.trim() || "";
  const fromMenu = value ? ask.options.find((o) => o.value === value)?.label : undefined;
  const label = (fromMenu || answer.answered_with?.label || value || "").trim();
  if (!value && !label) return null;
  return { slot: ask.slot, label: label || value, value };
}
