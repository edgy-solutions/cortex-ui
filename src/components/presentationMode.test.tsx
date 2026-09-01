/**
 * PRESENTATION MODE IS A VIEW STATE, NOT A LAYOUT CHANGE.
 *
 * The board must be identical entering and leaving — same card positions, same sizes, same
 * arrangement — so presenting a board never reflows it. That is the seeded-card-is-identical-
 * to-a-dragged-one invariant applied to the viewport, and it is the one thing here that would
 * be unforgivable to get wrong: a demo where switching to full screen rearranges the room's
 * board is worse than no full screen at all.
 *
 * The other rule is about being trapped. Hover PEEKS and click PINS, but no exit is reachable
 * only by hovering — in a demo the person driving may not be the person who built it.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Layout mounts the header, which mounts UserMenu, which needs an OIDC context. The subject
// here is the RAILS; standing up a real provider would test the provider.
vi.mock("react-oidc-context", () => ({
  useAuth: () => ({
    isAuthenticated: true,
    user: { profile: { name: "tester", preferred_username: "tester" } },
    signoutRedirect: () => {},
    removeUser: () => {},
  }),
}));
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { Layout } from "./Layout";
import { readFileSync } from "node:fs";
import path from "node:path";
import { usePresentationStore, railOpen } from "@/store/usePresentationStore";
import { useCanvasStore } from "@/store/useCanvasStore";
import { useStageStore } from "@/store/useStageStore";

beforeEach(() => {
  usePresentationStore.setState({ fullScreen: false, leftPinned: false, rightPinned: false });
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null } as never);
});
afterEach(cleanup);

const mount = () =>
  render(<Layout stream={<div>STREAM</div>} canvas={<div>CANVAS</div>} hud={<div>HUD</div>} />);

describe("presenting never rearranges a board the reader arranged", () => {
  it("an ARRANGED board is byte-identical across a full round trip", () => {
    // The invariant, and it is narrower than the one this test first claimed. It used to say
    // "entering and leaving changes NO card", which stopped being true the day untouched
    // boards began re-fitting to the pane — and a test that overstates its subject is a test
    // that will one day be weakened to fit reality instead of the reality being questioned.
    //
    // What must hold is this: the moment a human moves, resizes or drops a card, the board is
    // THEIRS, and presenting it must never rearrange it. An untouched board has no
    // arrangement to preserve.
    useStageStore.setState({
      canvases: [
        {
          id: "c1",
          name: "P",
          use: "portfolio_planning",
          arranged: true,
          items: [
            { id: "a", x: 10, y: 20, w: 300, h: 400 },
            { id: "b", x: 330, y: 20, w: 300, h: 400 },
          ],
        },
      ],
      view: "c1",
      viewport: { w: 1280, h: 1000 },
    } as never);
    const before = JSON.stringify(useStageStore.getState().canvases);

    usePresentationStore.getState().enterFullScreen();
    // The real consequence of entering: the pane gets wider. Simulated directly, because
    // jsdom fires no ResizeObserver and a test that skips this would prove nothing.
    useStageStore.getState().setViewport({ w: 1854, h: 1000 });
    expect(JSON.stringify(useStageStore.getState().canvases)).toBe(before);

    usePresentationStore.getState().exitFullScreen();
    useStageStore.getState().setViewport({ w: 1280, h: 1000 });
    expect(JSON.stringify(useStageStore.getState().canvases)).toBe(before);
  });

  it("presentation state lives in its OWN store, away from the fields that describe a board", () => {
    // `useStageStore.fullPane` is a different concept — one CARD filling the pane. Overloading
    // it would have made "does presenting change the layout" a question about a shared boolean.
    usePresentationStore.getState().enterFullScreen();
    expect(useStageStore.getState().fullPane).toBe(false);
  });
});
describe("railOpen — derived, so there is no state to fall out of sync", () => {
  it("outside presentation mode both rails are always open", () => {
    expect(railOpen({ fullScreen: false, pinned: false, hovering: false })).toBe(true);
  });

  it("inside it, a rail opens for a pin or a hover", () => {
    expect(railOpen({ fullScreen: true, pinned: false, hovering: false })).toBe(false);
    expect(railOpen({ fullScreen: true, pinned: true, hovering: false })).toBe(true);
    expect(railOpen({ fullScreen: true, pinned: false, hovering: true })).toBe(true);
  });

  it("a mere CURRENT card does not hold the rail open", () => {
    // The bug this replaced. `railOpen` once took a `selection` input read from
    // `Boolean(currentArtifactId)` — true from the first answer onwards and never false
    // again, so the rail was permanently open and presentation mode gave the board only the
    // LEFT rail`s width back. The condition described "a card is current", which is almost
    // always; the intent was "a card was just chosen", which is almost never.
    //
    // So this function knows nothing about selection at all. The transition drives the rail,
    // through revealRightOnSelection, and this stays pure.
    expect(railOpen({ fullScreen: true, pinned: false, hovering: false })).toBe(false);
  });
});

describe("the HUD opens on a CHANGE of selection, not on having one", () => {
  it("a card already current when the mode is entered does NOT open it", () => {
    // Entering with a card current is the state the reader was already in, not a request for
    // context. Opening then is exactly the bug this replaced, one layer down.
    useCanvasStore.setState({ currentArtifactId: "a1" } as never);
    usePresentationStore.getState().enterFullScreen();
    mount();
    expect(document.querySelector('[data-rail-strip="right"]')).not.toBeNull();
    expect(screen.queryByText("HUD")).toBeNull();
  });

  it("selecting a DIFFERENT card opens it", () => {
    useCanvasStore.setState({ currentArtifactId: "a1" } as never);
    usePresentationStore.getState().enterFullScreen();
    const view = mount();
    expect(screen.queryByText("HUD")).toBeNull(); // positive control: closed first

    useCanvasStore.setState({ currentArtifactId: "a2" } as never);
    view.rerender(<Layout stream={<div>STREAM</div>} canvas={<div>CANVAS</div>} hud={<div>HUD</div>} />);
    expect(screen.getByText("HUD")).toBeTruthy();
  });

  it("a selection change OUTSIDE the mode pins nothing", () => {
    // Outside presentation mode both rails are open anyway, so pinning would be an invisible
    // state change that then surprises the reader the next time they present.
    useCanvasStore.setState({ currentArtifactId: "a1" } as never);
    const view = mount();
    useCanvasStore.setState({ currentArtifactId: "a2" } as never);
    view.rerender(<Layout stream={<div>STREAM</div>} canvas={<div>CANVAS</div>} hud={<div>HUD</div>} />);
    expect(usePresentationStore.getState().rightPinned).toBe(false);
  });
  it("and the reader closes it with the SAME chevron as any pinned rail", () => {
    // One mechanism, not two that look alike: revealing pins, so unpinning closes.
    usePresentationStore.setState({ fullScreen: true, rightPinned: true });
    mount();
    expect(screen.getByText("HUD")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Unpin live context"));
    expect(usePresentationStore.getState().rightPinned).toBe(false);
  });
});
describe("nothing is reachable only by hovering", () => {
  it("the mode control is drawn whether or not the mode is on", () => {
    mount();
    expect(screen.getByLabelText("Full screen")).toBeTruthy();
    cleanup();
    usePresentationStore.getState().enterFullScreen();
    mount();
    expect(screen.getByLabelText("Exit full screen")).toBeTruthy();
  });

  it("each collapsed rail draws its own chevron unconditionally", () => {
    usePresentationStore.getState().enterFullScreen();
    mount();
    expect(document.querySelector('[data-rail-strip="left"]')).not.toBeNull();
    expect(document.querySelector('[data-rail-strip="right"]')).not.toBeNull();
    expect(screen.getByLabelText("Open Answers")).toBeTruthy();
    expect(screen.getByLabelText("Open Live context")).toBeTruthy();
  });

  it("and neither way out is GATED on hover — asserted on the RENDERED classes", () => {
    // THIS ASSERTION WAS ONCE ABANDONED, AND THE ABANDONMENT WAS WRONG.
    //
    // A previous version of this file replaced it with a source-text check and said, in a
    // comment, that the DOM version "could not be made to bite" and that I did not know why.
    // That was investigated properly and the claim is false: rendering the collapsed rails and
    // reading `getAttribute("class")` sees exactly what you would expect — the real classes on
    // correct code, and `"hidden"` the moment the chevron is mutated. Green then red, same
    // file, same mechanism.
    //
    // So there is no jsdom boundary here and no category of blind DOM guards to audit. What
    // actually happened is duller and more useful: an edit that did not land the way I believed
    // it had. Three of those in one day is a tooling problem, not a framework one — hence the
    // note in the source guard below, which now says what it is for rather than apologising for
    // this one.
    usePresentationStore.getState().enterFullScreen();
    mount();
    const ways = [
      ...document.querySelectorAll("[data-mode-toggle]"),
      ...document.querySelectorAll("[data-rail-toggle]"),
    ];
    // Positive control: the exit control plus one chevron per collapsed rail.
    expect(ways.length).toBe(3);
    for (const el of ways) {
      // getAttribute, not `.className` — for an SVG that property is an SVGAnimatedString, and
      // an assertion that silently receives an object is an assertion that stops checking.
      const cls = el.getAttribute("class") ?? "";
      expect(cls, `a way out is hover-gated: ${cls}`).not.toMatch(/hidden/);
      expect(cls, `a way out is hover-gated: ${cls}`).not.toMatch(/hover:(flex|block|inline)/);
      expect(cls).not.toMatch(/group-hover/);
    }
  });

  it("and no control ANYWHERE in these files is hover-gated — the wider net", () => {
    // Kept alongside the DOM assertion rather than replaced by it. They catch different things:
    // the DOM one covers the controls that actually render in this state, this one covers every
    // control in these files including states this test does not mount. Neither subsumes the
    // other, which is why both stay.
    const files = {
      "Layout.tsx": readFileSync(path.join(__dirname, "Layout.tsx"), "utf8"),
      "RailStrip.tsx": readFileSync(path.join(__dirname, "RailStrip.tsx"), "utf8"),
    };
    for (const [name, src] of Object.entries(files)) {
      expect(src, name + " gates a control on hover").not.toMatch(/hover:(flex|block|inline|visible)/);
      expect(src, name + " hides a control").not.toMatch(/className="hidden"/);
      expect(src, name + " gates a control on a parent hover").not.toMatch(/group-hover:/);
    }
    // Positive control: these files really are the ones carrying the controls.
    expect(files["Layout.tsx"]).toContain("data-mode-toggle");
    expect(files["RailStrip.tsx"]).toContain("data-rail-toggle");
  });

  it("the mode control alone can get you out", () => {
    usePresentationStore.getState().enterFullScreen();
    mount();
    fireEvent.click(screen.getByLabelText("Exit full screen"));
    expect(usePresentationStore.getState().fullScreen).toBe(false);
    // And a rail chevron is a second way — three routes out, as asked.
    expect(screen.getByText("STREAM")).toBeTruthy();
  });

  it("leaving CLEARS the pins rather than carrying them out of the mode", () => {
    usePresentationStore.setState({ fullScreen: true, leftPinned: true, rightPinned: true });
    usePresentationStore.getState().exitFullScreen();
    expect(usePresentationStore.getState().leftPinned).toBe(false);
    expect(usePresentationStore.getState().rightPinned).toBe(false);
  });
});

describe("the collapsed strip says what is behind it and nothing more", () => {
  it("the answers strip carries a live count", () => {
    useCanvasStore.setState({ artifacts: [{ id: "a" }, { id: "b" }, { id: "c" }] } as never);
    usePresentationStore.getState().enterFullScreen();
    mount();
    expect(within(document.querySelector('[data-rail-strip="left"]') as HTMLElement).getByText("3")).toBeTruthy();
  });

  it("a rail with nothing to count shows NO number rather than a zero", () => {
    // A zero would read as "empty"; the HUD is not a countable thing at all.
    usePresentationStore.getState().enterFullScreen();
    mount();
    const right = document.querySelector('[data-rail-strip="right"]') as HTMLElement;
    expect(right.textContent).not.toMatch(/\d/);
  });

  it("both panes are absent while collapsed and present while open", () => {
    usePresentationStore.getState().enterFullScreen();
    mount();
    expect(screen.queryByText("STREAM")).toBeNull();
    expect(screen.queryByText("HUD")).toBeNull();
    // Positive control: they exist at all.
    cleanup();
    usePresentationStore.getState().exitFullScreen();
    mount();
    expect(screen.getByText("STREAM")).toBeTruthy();
    expect(screen.getByText("HUD")).toBeTruthy();
  });
});
