import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StaleBundleBanner } from "@/components/StaleBundleBanner";
import { useRegistrationStore } from "@/store/useRegistrationStore";

beforeEach(() => useRegistrationStore.setState({ stale: null }));
afterEach(() => vi.unstubAllGlobals());

describe("StaleBundleBanner", () => {
  it("renders nothing when not stale", () => {
    const { container } = render(<StaleBundleBanner />);
    expect(container.innerHTML).toBe("");
  });
  it("shows both shas and a Reload button that reloads", () => {
    const reload = vi.fn();
    vi.stubGlobal("location", { ...window.location, reload });
    useRegistrationStore.getState().reportStale("def5678aaaa", "abc1234bbbb");
    const { container } = render(<StaleBundleBanner />);
    const el = container.querySelector("[data-stale-bundle]")!;
    expect(el.getAttribute("data-stale-mine")).toBe("def5678aaaa");
    expect(el.getAttribute("data-stale-served")).toBe("abc1234bbbb");
    expect(el.getAttribute("role")).toBe("status");
    expect(el.textContent).toContain("abc1234");
    expect(el.textContent).toContain("def5678");
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it("refused (default): says the menu is not registered", () => {
    useRegistrationStore.getState().reportStale("def5678aaaa", "abc1234bbbb");
    const { container } = render(<StaleBundleBanner />);
    const el = container.querySelector("[data-stale-bundle]")!;
    expect(el.getAttribute("data-stale-refused")).toBe("true");
    expect(el.textContent).toContain("menu is not registered");
    expect(el.textContent).not.toContain("reload to update");
  });
  it("not refused (watcher): says reload to update, never 'not registered'", () => {
    useRegistrationStore.getState().reportStale("def5678aaaa", "abc1234bbbb", false);
    const { container } = render(<StaleBundleBanner />);
    const el = container.querySelector("[data-stale-bundle]")!;
    expect(el.getAttribute("data-stale-refused")).toBe("false");
    expect(el.textContent).toContain("reload to update");
    expect(el.textContent).not.toContain("not registered");
  });
  it("refused is sticky and served follows the newest", () => {
    const st = useRegistrationStore.getState();
    st.reportStale("def5678aaaa", "abc1234bbbb", true);
    st.reportStale("def5678aaaa", "fff9999cccc", false);
    expect(useRegistrationStore.getState().stale).toEqual({ mine: "def5678aaaa", served: "fff9999cccc", refused: true });
    useRegistrationStore.setState({ stale: null });
    st.reportStale("def5678aaaa", "abc1234bbbb", false);
    st.reportStale("def5678aaaa", "abc1234bbbb", true);
    expect(useRegistrationStore.getState().stale?.refused).toBe(true);
  });
});
