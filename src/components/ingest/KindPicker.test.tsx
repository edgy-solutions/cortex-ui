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
    fireEvent.click(document.querySelector('[data-ingest-kind="cad"] input')!);
    fireEvent.click(document.querySelector('[data-ingest-kind-confirm]')!);
    expect(onConfirm).toHaveBeenCalledWith("cad");
  });

  it("a blockedReason disables confirm even with a kind picked, and shows the reason", () => {
    render(<KindPicker onConfirm={() => {}} blockedReason="no on_behalf_of email available" />);
    fireEvent.click(document.querySelector('[data-ingest-kind="pdf"] input')!);
    expect((document.querySelector('[data-ingest-kind-confirm]') as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-ingest-kind-blocked]")?.textContent).toMatch(/no on_behalf_of email/);
  });
});
