/**
 * The rail's paging cutoff, as a pure function.
 *
 * The rail interleaves two paged sources (answers, drops), each newest-first. A source with more
 * pages has a FRONTIER: the timestamp of its oldest loaded item. Below it the source's items are
 * not loaded, so anything older than the NEWEST frontier is drawn against a source that may have
 * items in between. The rail hides it rather than draw a gap as if it were complete.
 */
export interface RailSource {
  name: "answers" | "drops";
  /** The source has another page to load. */
  more: boolean;
  /** Timestamp (ms) of the oldest loaded item; null when nothing is loaded. */
  frontier: number | null;
}

/** The newest frontier among sources that have more; null when none do (no cutoff, no control). */
export function railCutoff(sources: readonly RailSource[]): number | null {
  let cutoff: number | null = null;
  for (const s of sources) {
    if (!s.more || s.frontier === null) continue;
    if (cutoff === null || s.frontier > cutoff) cutoff = s.frontier;
  }
  return cutoff;
}

/** An item exactly at the cutoff is shown: the source whose frontier it is has loaded it. */
export function shownByCutoff(ts: number, cutoff: number | null): boolean {
  return cutoff === null || ts >= cutoff;
}

/** The sources a click loads: every one with more whose frontier IS the cutoff. */
export function sourcesToLoad(sources: readonly RailSource[]): RailSource["name"][] {
  const cutoff = railCutoff(sources);
  if (cutoff === null) return [];
  return sources.filter((s) => s.more && s.frontier === cutoff).map((s) => s.name);
}
