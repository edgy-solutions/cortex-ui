import { BIND, type AskCardPayload, type Reroute } from "./Elicitation.contract";

/**
 * Where an answered ask goes — and the honest report that half of it has nowhere to go yet.
 *
 * ── RESPEAK WORKS TODAY, WITH NO SERVER CHANGE ────────────────────────────────────────────
 *
 * It composes a phrase and hands it to the ordinary send path, because that is what a
 * re-speak IS: words re-entering as words, filled and resolved exactly as any question is.
 *
 * ── BIND HAS NO ROUTE, AND THAT IS A FINDING, NOT A BUG HERE ──────────────────────────────
 *
 * `resolve_ask` exists as a pure in-process function with NO caller but a battery script and
 * its tests — no endpoint reaches it — and cortex's own send path takes a bare string, so
 * there is no transport on either side carrying pre-bound slots.
 *
 * IT WOULD BE EASY TO FAKE, AND FAKING IT DESTROYS THE ONE GUARANTEE BIND EXISTS FOR. The
 * phrase `"<sub_query> (<slot>: P1)"` would very likely resolve — and it would go back through
 * the filler and the resolver, which is precisely what BIND was built to avoid: the second turn
 * must be RECONSTRUCTED, never re-parsed, so it cannot parse the phrase differently than the
 * first turn did. A fallback that usually works is worse than none, because it makes the
 * missing seam invisible until the day the re-parse disagrees.
 *
 * So a pick is accepted, validated, and then reported as undeliverable. The producer's own
 * docstring notes both live ask cases currently fall to free text (`too_many`), so this path
 * has no live case today — which is why naming it costs nothing and hiding it would cost the
 * next person the whole diagnosis.
 */

export interface DispatchResult {
  /**
   * Present when the answer was valid but could not be carried. Shown to the reader.
   *
   * THERE IS NO `sent` FLAG BESIDE IT, and there was one until a mutation run showed nothing
   * read it: flipping it to `true` on the blocked path left every test green. An unconsumed
   * field that looks authoritative is the shape this codebase keeps filing against, so absence
   * of `blocked` IS the report that it went — one fact, one place.
   */
  blocked?: string;
}

export function dispatchReroute(
  reroute: Reroute,
  ask: AskCardPayload,
  send: (query: string) => void,
): DispatchResult {
  if (reroute.action === BIND) {
    void ask;
    return {
      blocked:
        "Your choice was accepted, but there is no route yet that carries a pre-bound slot — " +
        "re-asking it in words would re-parse the question, which is the one thing this path exists to avoid.",
    };
  }
  send(reroute.query);
  return {};
}
