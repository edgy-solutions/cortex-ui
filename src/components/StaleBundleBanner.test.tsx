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
});
