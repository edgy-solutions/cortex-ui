import { create } from "zustand";

/** One-shot hand-off of typed text to the composer (the `/ask?q=` deep link). `take` returns and
 *  clears, so a remount never re-types it. Offering never sends anything. */
interface ComposerPrefillState {
  text: string | null;
  offer: (t: string) => void;
  take: () => string | null;
}

export const useComposerPrefillStore = create<ComposerPrefillState>((set, get) => ({
  text: null,
  offer: (t) => set({ text: t }),
  take: () => {
    const t = get().text;
    if (t !== null) set({ text: null });
    return t;
  },
}));
