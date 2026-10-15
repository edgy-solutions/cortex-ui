import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { KindPicker } from "./KindPicker";

afterEach(cleanup);

describe("KindPicker — the closed INGEST_KINDS set only", () => {
  it("renders exactly the three closed file kinds — no free-text input anywhere", () => {
    render(<KindPicker onConfirm={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
    expect(document.querySelector('[data-ingest-kind="pdf"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-kind="cad"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-kind="xml"]')).toBeTruthy();
    expect(document.querySelector('[data-ingest-kind="event"]')).toBeNull();
    expect(document.querySelector('input[type="text"]')).toBeNull();
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("pre-selects the suggestion when it names a kind in INGEST_KINDS", () => {
    render(<KindPicker suggestedKind="pdf" onConfirm={() => {}} />);
    const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
    expect(radio.checked).toBe(true);
    expect((document.querySelector('[data-ingest-kind-confirm]') as HTMLButtonElement).disabled).toBe(false);
  });

  it("pre-selects nothing, and disables confirm, when the suggestion is not one of INGEST_KINDS", () => {
    render(<KindPicker suggestedKind="spreadsheet" onConfirm={() => {}} />);
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector('[data-ingest-kind-confirm]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("pre-selects nothing, and disables confirm, when no suggestion is given — the real transport's case", () => {
    render(<KindPicker onConfirm={() => {}} />);
    expect((document.querySelector('[data-ingest-kind-confirm]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("confirm calls onConfirm with the chosen kind once a choice is made", () => {
    const onConfirm = vi.fn();
    render(<KindPicker onConfirm={onConfirm} />);
    fireEvent.click(document.querySelector('[data-ingest-kind="xml"] input')!);
    fireEvent.click(document.querySelector('[data-ingest-kind-confirm]')!);
    expect(onConfirm).toHaveBeenCalledWith("xml");
  });

  it("a blockedReason disables confirm even with a kind picked, and shows the reason", () => {
    render(<KindPicker onConfirm={() => {}} blockedReason="no on_behalf_of email available" />);
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    expect((document.querySelector('[data-ingest-kind-confirm]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-ingest-kind-blocked]")?.textContent).toMatch(/no on_behalf_of email/);
  });
});

describe("KindPicker — kinds awaiting registration (cad, row 7f)", () => {
  it("draws cad disabled, greyed and marked; pdf and xml stay enabled", () => {
    render(<KindPicker onConfirm={() => {}} />);
    const cad = document.querySelector('[data-ingest-kind="cad"]') as HTMLElement;
    expect((cad.querySelector("input") as HTMLInputElement).disabled).toBe(true);
    expect(cad.getAttribute("data-ingest-kind-awaiting")).toBe("true");
    expect(cad.getAttribute("aria-disabled")).toBe("true");
    expect(cad.getAttribute("title")).toMatch(/kind_unregistered/);
    expect(cad.textContent).toContain("awaiting registration");
    for (const k of ["pdf", "xml"]) {
      const el = document.querySelector(`[data-ingest-kind="${k}"]`) as HTMLElement;
      expect((el.querySelector("input") as HTMLInputElement).disabled).toBe(false);
      expect(el.hasAttribute("data-ingest-kind-awaiting")).toBe(false);
      expect(el.textContent).not.toContain("awaiting");
    }
  });
  it("a suggestedKind of cad selects nothing and confirm stays disabled", () => {
    render(<KindPicker suggestedKind="cad" onConfirm={() => {}} />);
    for (const r of screen.getAllByRole("radio")) expect((r as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector("[data-ingest-kind-confirm]") as HTMLButtonElement).disabled).toBe(true);
  });
  it("clicking cad selects nothing and reports nothing", () => {
    const onSelect = vi.fn();
    const onConfirm = vi.fn();
    render(<KindPicker onConfirm={onConfirm} onSelect={onSelect} />);
    fireEvent.click(document.querySelector('[data-ingest-kind="cad"] input')!);
    fireEvent.click(document.querySelector('[data-ingest-kind="cad"]')!);
    expect(onSelect).not.toHaveBeenCalled();
    expect((document.querySelector('[data-ingest-kind="cad"] input') as HTMLInputElement).checked).toBe(false);
    expect((document.querySelector("[data-ingest-kind-confirm]") as HTMLButtonElement).disabled).toBe(true);
  });
});
