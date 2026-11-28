/**
 * THE ANSWERS-PANEL STRIP SAYS HOW LONG THE ANSWER HAS BEEN RUNNING.
 *
 * On sandbox (2026-11-27) a question sat at "Locating the subject" for five minutes, and the strip
 * showed a spinner, the stage and "Stage 2/5" and nothing else, so 5:00 looked like 0:05. The
 * architect approved the wording on 2026-11-27: the stage stays first, then " · m:ss".
 *
 * Elapsed ONLY. "Longer than usual" and the stalled line compare against a producer-served
 * expected_ms; until it is served cortex says nothing about whether the time is long. The 5:03
 * arm pins that absence, because a client that guessed would say it right there.
 *
 * Fixtures go through the real store (see useLiveStages.test.ts for why), and the clock is the
 * real one in the hook, faked only at the timer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, cleanup } from "@testing-library/react";
import { useInterviewStore } from "@/store/useInterviewStore";
import { LiveAnswerStrip } from "./LiveAnswerStrip";
import { LiveStageCapsule } from "./LiveStageCapsule";

const MSG = "agent-1";

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-11-27T12:00:00Z") });
  const s = useInterviewStore.getState();
  s.reset();
  s.addMessage({ id: MSG, role: "agent", content: "", isStreaming: true, timestamp: 0 });
  // startedAt is stamped by the store from Date.now(), i.e. the faked clock.
  s.upsertThinkingStep(MSG, { kind: "locating", label: "Locating the subject", status: "loading" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const elapsed = (c: HTMLElement) => c.querySelector("[data-live-elapsed]")?.textContent ?? null;

describe("LiveAnswerStrip shows the elapsed time", () => {
  it("reads m:ss beside the stage, the stage first", () => {
    useInterviewStore.getState().setIsProcessing(true);
    const { container } = render(<LiveAnswerStrip />);
    act(() => {
      vi.advanceTimersByTime(42_000);
    });
    expect(elapsed(container)).toBe("· 0:42");
    const text = container.textContent ?? "";
    expect(text.indexOf("Locating the subject")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Locating the subject")).toBeLessThan(text.indexOf("0:42"));
  });

  it("keeps counting, and with no expected time served it judges nothing", () => {
    useInterviewStore.getState().setIsProcessing(true);
    const { container } = render(<LiveAnswerStrip />);
    act(() => {
      vi.advanceTimersByTime(303_000);
    });
    expect(elapsed(container)).toBe("· 5:03");
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/longer than usual/i);
    expect(text).not.toMatch(/stuck|still working/i);
  });

  it("renders nothing when no answer is in flight", () => {
    // isProcessing stays false: the step exists but the turn is not running.
    const { container } = render(<LiveAnswerStrip />);
    act(() => {
      vi.advanceTimersByTime(42_000);
    });
    expect(container.querySelector("[data-live-elapsed]")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("the capsule above the prompt reads the same clock, in the same form", () => {
  // Two clocks in different formats on one screen is a defect (architect, 2026-11-27). The capsule
  // read "42s" / "5m 03s" while the strip read "0:42" / "5:03".
  it("both read m:ss, and read the same", () => {
    useInterviewStore.getState().setIsProcessing(true);
    const { container } = render(
      <>
        <LiveAnswerStrip />
        <LiveStageCapsule />
      </>,
    );
    act(() => {
      vi.advanceTimersByTime(303_000);
    });
    const capsule = container.querySelector("[data-capsule-elapsed]")?.textContent ?? null;
    expect(capsule).toBe("5:03");
    expect(elapsed(container)).toBe(`· ${capsule}`);
  });
});
