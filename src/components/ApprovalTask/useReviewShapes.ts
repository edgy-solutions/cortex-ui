/**
 * useReviewShapes -- the review-shape registry (`GET /review-shapes`), fetched once per page.
 *
 * Card-agnostic: any review card that builds its plan or coverage from a registry row reads it here. The promise is
 * cached at module level, so every card on the page shares one request; a rejection is cached too (a reload retries).
 */
import { useEffect, useState } from "react";
import { fetchReviewShapes } from "@/lib/ingestTransport";
import { readReviewShapes, type ShapeRow } from "@/lib/reviewShapes";

export type ReviewShapesState =
  | { phase: "loading" }
  | { phase: "ready"; rows: ShapeRow[] }
  | { phase: "failed"; why: string };

/** The sentence for a failed fetch (`reviewRouteFailure` names only the extraction and source routes). */
function failure(err: unknown): string {
  const res = typeof err === "object" && err !== null ? (err as { response?: { status?: unknown } }).response : undefined;
  const status = res && typeof res.status === "number" ? res.status : null;
  return status !== null
    ? `The review shapes could not be loaded (${status}).`
    : "The review shapes could not be loaded.";
}

let cached: Promise<ReviewShapesState> | null = null;

function load(): Promise<ReviewShapesState> {
  if (cached === null) {
    cached = fetchReviewShapes().then(
      (body): ReviewShapesState => ({ phase: "ready", rows: readReviewShapes(body) }),
      (err): ReviewShapesState => ({ phase: "failed", why: failure(err) }),
    );
  }
  return cached;
}

/** Test-only: forget the cached request so the next hook mount fetches again. */
export function resetReviewShapesCache(): void {
  cached = null;
}

export function useReviewShapes(): ReviewShapesState {
  const [state, setState] = useState<ReviewShapesState>({ phase: "loading" });
  useEffect(() => {
    let live = true;
    void load().then((s) => {
      if (live) setState(s);
    });
    return () => {
      live = false;
    };
  }, []);
  return state;
}
