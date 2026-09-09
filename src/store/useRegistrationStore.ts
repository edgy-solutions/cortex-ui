import { create } from "zustand";

/**
 * DID THE TWO HALVES AGREE ABOUT WHAT CAN BE DRAWN — which is not a question shas can answer.
 *
 * ── WHY THIS IS A SEPARATE SIGNAL FROM THE BUILD STAMP ────────────────────────────────────
 *
 * The header's two shas say what is DEPLOYED. They cannot say whether this client and the mesh
 * agree about which archetypes exist, because that agreement is established at runtime by the
 * ADR-0017 registration and can fail with both halves perfectly up to date — a row the server
 * declines, a subject spelled two ways, a contract that drifted.
 *
 * And it fails QUIETLY IN THE WORST WAY. `sent != accepted` means the server kept fewer
 * capabilities than this client offered, so some answer will later select an archetype from a
 * shorter menu and render a plausible, wrong card. Nothing throws. Nothing is blank. The
 * failure mode is a card that looks finished — the shape this codebase has repeatedly found is
 * the least likely to be investigated.
 *
 * It has been a console line since the beginning. A console line is read by whoever thinks to
 * open the console, which is nobody at the moment the wrong card is on screen.
 *
 * ── FOUR STATES, AND THEY MUST STAY FOUR ──────────────────────────────────────────────────
 *
 *   idle      nothing has been attempted yet this session
 *   agreed    sent N, accepted N — the halves agree
 *   partial   sent N, accepted M < N — THE FINDING
 *   failed    the request itself did not succeed — nothing was established either way
 *
 * `partial` and `failed` are the pair most tempting to fold: both mean "the menu is not what
 * this client offered". They have opposite repairs — one is a row the server refused and is
 * diagnosed by comparing names against the graph, the other is a request to retry — and the
 * same collapse cost a person a wrong answer on the version row earlier tonight.
 *
 * NOT PURGED on an owner change, and declared as such in `sessionIsolation.ts`: it describes
 * what THIS CLIENT advertised about itself, which is a fact about the build rather than about
 * the person signed in, and is identical for every caller.
 */
export type RegistrationStatus = "idle" | "agreed" | "partial" | "failed";

interface RegistrationState {
  status: RegistrationStatus;
  /** Rows this client offered. Null until an attempt has been made. */
  sent: number | null;
  /** Rows the server reported keeping. Null when the request never returned one. */
  accepted: number | null;
  /** How many times the registration has been re-asserted after a wipe. */
  reassertions: number;
  report: (r: { sent: number; accepted: number; reassertion: boolean }) => void;
  reportFailure: () => void;
}

export const useRegistrationStore = create<RegistrationState>()((set) => ({
  status: "idle",
  sent: null,
  accepted: null,
  reassertions: 0,

  report: ({ sent, accepted, reassertion }) =>
    set((s) => ({
      // EQUALITY IS THE WHOLE TEST. A server that accepted MORE than was sent is not agreement
      // either — it would mean the menu holds rows this client never offered, which is the same
      // disagreement pointing the other way, so anything but equality is `partial`.
      status: accepted === sent ? "agreed" : "partial",
      sent,
      accepted,
      reassertions: s.reassertions + (reassertion ? 1 : 0),
    })),

  reportFailure: () =>
    set({
      status: "failed",
      sent: null,
      // NULL, NOT ZERO. Zero accepted is a real and different outcome — the server answered and
      // kept nothing. A request that never returned has no count at all, and writing 0 would
      // state a measurement nobody took.
      accepted: null,
    }),
}));
