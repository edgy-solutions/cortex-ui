/**
 * Evidence summon state — evidence is SUMMONED, not resident.
 *
 * Citizens persist on the timeline (things awaiting your attention); evidence is
 * summoned BY a citizen (a review), subordinate to it, and leaves with it. It
 * never enters the timeline, never gets an entry, never persists after the review
 * resolves. One summoned item at a time: summoning part 2 replaces part 1.
 *
 * This class generalizes past reviews — lineage traces, DQ detail, future
 * join-candidate views are all evidence-class. Naming the class now keeps them
 * from being born as canvas squatters.
 */
import { create } from "zustand";

export interface SummonedEvidence {
  /** The review this evidence is subordinate to (the grouped task / batch id). */
  reviewId: string;
  /** The notice to read provenance for. */
  noticeId: string;
  /** The part row whose source is being shown. */
  mpn: string;
}

interface EvidenceState {
  summoned: SummonedEvidence | null;
  summon: (e: SummonedEvidence) => void;
  dismiss: () => void;
  /** Dismiss if the summoned evidence belongs to a review that just left view. */
  dismissForReview: (reviewId: string) => void;
}

export const useEvidenceStore = create<EvidenceState>((set) => ({
  summoned: null,
  summon: (e) => set({ summoned: e }),
  dismiss: () => set({ summoned: null }),
  dismissForReview: (reviewId) =>
    set((s) => (s.summoned?.reviewId === reviewId ? { summoned: null } : {})),
}));
