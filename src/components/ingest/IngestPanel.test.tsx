import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { IngestPanel } from "./IngestPanel";

vi.mock("@/lib/ingestFlag", () => ({
  isIngestUiEnabled: vi.fn(() => false),
}));

afterEach(cleanup);

describe("IngestPanel — flag off", () => {
  it("renders nothing when isIngestUiEnabled() is false", () => {
    const { container } = render(<IngestPanel />);
    expect(container.innerHTML).toBe("");
    expect(document.querySelector("[data-ingest-panel]")).toBeNull();
  });
});

/**
 * The drop flow has NO origin field — SEALED. `POST /ingest` takes `file`, `kind`,
 * `on_behalf_of`; origin is resolved server-side (or not at all, today) and nothing the dropper
 * types feeds it. Architect ruling 2026-10-02 "ORIGIN, not audience" names this explicitly: the
 * dropper never supplies it. A field matching this pattern appearing on either step would be a
 * regression toward asking the dropper to assert their own origin.
 */
describe("the drop and kind steps carry no origin/program/domain/owner input", () => {
  const FORBIDDEN = /origin|program|domain|owner/i;

  function assertNoForbiddenInput(container: HTMLElement) {
    const candidates = container.querySelectorAll("input, select, textarea");
    for (const el of candidates) {
      const name = el.getAttribute("name") ?? "";
      const placeholder = el.getAttribute("placeholder") ?? "";
      const ariaLabel = el.getAttribute("aria-label") ?? "";
      const id = el.getAttribute("id") ?? "";
      let labelText = "";
      if (id) {
        const label = container.querySelector(`label[for="${id}"]`);
        labelText = label?.textContent ?? "";
      }
      const parentLabel = el.closest("label")?.textContent ?? "";
      const haystack = [name, placeholder, ariaLabel, labelText, parentLabel].join(" ");
      expect(haystack, `forbidden field found: ${el.outerHTML}`).not.toMatch(FORBIDDEN);
    }
  }

  it("the drop step has no such input", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ingestFlag", () => ({ isIngestUiEnabled: () => true }));
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({ user: { profile: { email: "steward@example.com" } } }),
    }));
    const { IngestPanel: Panel } = await import("./IngestPanel");
    const { container } = render(<Panel />);
    expect(container.querySelector("[data-ingest-drop]")).toBeTruthy();
    assertNoForbiddenInput(container);
  });

  it("the kind step has no such input either, after a file is dropped", async () => {
    vi.resetModules();
    vi.doMock("@/lib/ingestFlag", () => ({ isIngestUiEnabled: () => true }));
    vi.doMock("react-oidc-context", () => ({
      useAuth: () => ({ user: { profile: { email: "steward@example.com" } } }),
    }));
    const { IngestPanel: Panel } = await import("./IngestPanel");
    const { container } = render(<Panel />);
    const fileInput = container.querySelector("[data-ingest-file-input]") as HTMLInputElement;
    const file = new File(["x"], "drawing.pdf", { type: "application/pdf" });
    fireEvent.change(fileInput, { target: { files: [file] } });
    expect(container.querySelector("[data-kind-picker]")).toBeTruthy();
    assertNoForbiddenInput(container);
  });
});
