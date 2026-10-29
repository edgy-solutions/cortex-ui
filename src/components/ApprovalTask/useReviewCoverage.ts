import { useCallback, useEffect, useRef, useState } from "react";
import type { ReviewPlan } from "@/lib/reviewRuns";

/**
 * What a steward has covered on a many-part notice (flag `promotionRuns`): which parts they LOOKED at,
 * which shared facts they CONFIRMED once, which view and which runs are open. The card keeps owning its
 * own drafts and selection; this hook only carries them to and from storage so a reload resumes.
 *
 * BROWSER-ONLY STAND-IN. Until the server holds the draft and the coverage key
 * (sessions/2026-10-28-packet-to-lane-01-from-cortex-promotion-review-at-scale-a-saved-draft-and-a-coverage-key.md
 * section 1), a resume lives in THIS browser's localStorage and nowhere else: another browser or a cleared
 * profile starts over, and nothing here reaches the wire. The banner says so out loud.
 *
 * Every storage touch is in try/catch (private windows, quota, a blocked store), and a saved entry that does
 * not parse or whose `v` is not 1 is ignored, never half-applied.
 *
 * The hook is inert until `enabled`: the card passes `plan !== null`, so nothing is read before the rows (and
 * with them the attempt, which is part of the key) have arrived, and nothing at all when the flag is off.
 */
export const COVERAGE_VERSION = 1;
/** Per OWNER: a shared browser must not hand steward A's looked set and unsent fixes to steward B. */
export const coverageKey = (owner: string, taskId: string, ingestId: string, attempt: number | null): string =>
  `cortex.promotionReview.v1:${owner}.${taskId}.${ingestId}.${attempt ?? "?"}`;

/** What the card hands back to be applied to its own state: unvalidated, the card checks the shapes it owns. */
export interface RestoredDrafts {
  draft: unknown;
  headerDraft: unknown;
  sel: unknown;
}

export type CoverageView = "runs" | "rows";

interface Saved {
  looked: string[];
  confirmed: string[];
  drafts: RestoredDrafts;
}

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);

function readSaved(key: string): Saved | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const o: unknown = JSON.parse(raw);
    if (typeof o !== "object" || o === null || (o as { v?: unknown }).v !== COVERAGE_VERSION) return null;
    const s = o as Record<string, unknown>;
    return { looked: strings(s.looked), confirmed: strings(s.confirmed), drafts: { draft: s.draft, headerDraft: s.headerDraft, sel: s.sel } };
  } catch {
    return null;
  }
}

/** unit index -> id of the run it belongs to. */
export function runIdByUnit(plan: ReviewPlan): Map<number, string> {
  const m = new Map<number, string>();
  for (const s of plan.segments) if (s.kind === "run") for (const u of s.run.units) m.set(u, s.run.id);
  return m;
}

export function useReviewCoverage({
  enabled,
  owner,
  taskId,
  ingestId,
  attempt,
  draft,
  headerDraft,
  sel,
  onRestore,
}: {
  enabled: boolean;
  /** Who is signed in. null persists and restores NOTHING (the review still works in memory). */
  owner: string | null;
  taskId: string;
  ingestId: string;
  attempt: number | null;
  draft: unknown;
  headerDraft: unknown;
  sel: number;
  /** Called with the saved drafts on a resume, and with null on `startOver`. */
  onRestore: (saved: RestoredDrafts | null) => void;
}) {
  const [looked, setLooked] = useState<Set<string>>(() => new Set());
  const [confirmed, setConfirmed] = useState<Set<string>>(() => new Set());
  const [view, setView] = useState<CoverageView>("runs");
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [resumed, setResumed] = useState<{ looked: number } | null>(null);
  const key = owner === null ? null : coverageKey(owner, taskId, ingestId, attempt);
  const loadedKey = useRef<string | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;
  // The commit that applies a restore still holds the pre-restore state; writing it would overwrite the
  // very entry being restored. The next commit carries the restored values and writes them. After a start over
  // the same skip keeps the commit that clears the state from writing the key straight back.
  const skipWrite = useRef(false);
  const restoreRef = useRef(onRestore);
  restoreRef.current = onRestore;

  useEffect(() => {
    if (!enabled || key === null) return;
    loadedKey.current = key;
    const saved = readSaved(key);
    if (!saved) return;
    skipWrite.current = true;
    setLooked(new Set(saved.looked));
    setConfirmed(new Set(saved.confirmed));
    // A pristine entry (the one start-over leaves behind) is not a resume worth announcing.
    setResumed(saved.looked.length > 0 || saved.confirmed.length > 0 ? { looked: saved.looked.length } : null);
    restoreRef.current(saved.drafts);
  }, [enabled, key]);

  useEffect(() => {
    if (!enabled || key === null || loadedKey.current !== key) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    try {
      window.localStorage.setItem(
        key,
        JSON.stringify({ v: COVERAGE_VERSION, looked: [...looked], confirmed: [...confirmed], draft, headerDraft, sel }),
      );
    } catch {
      /* a store that will not take the write only costs the resume */
    }
  }, [enabled, key, looked, confirmed, draft, headerDraft, sel]);

  const markLooked = useCallback((id: string) => setLooked((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const openRun = useCallback((id: string) => setOpen((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const toggleRun = useCallback(
    (id: string) =>
      setOpen((s) => {
        const n = new Set(s);
        if (!n.delete(id)) n.add(id);
        return n;
      }),
    [],
  );
  const toggleConfirmed = useCallback(
    (k: string) =>
      setConfirmed((s) => {
        const n = new Set(s);
        if (!n.delete(k)) n.add(k);
        return n;
      }),
    [],
  );
  const startOver = useCallback(() => {
    try {
      if (key !== null) window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
    skipWrite.current = true;
    setLooked(new Set());
    setConfirmed(new Set());
    setOpen(new Set());
    setResumed(null);
    restoreRef.current(null);
  }, [key]);

  return { looked, confirmed, view, setView, open, resumed, markLooked, openRun, toggleRun, toggleConfirmed, startOver };
}
