/**
 * P0 2026-10-08 (sandbox rev 182): (a) a drop navigated the tab, (b) the pill opened no chooser.
 * The pointer-level proof is `e2e/ingestDrop.spec.ts`; these are the component's own arms, plus
 * the window guard that catches a drop which misses the zone.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent, createEvent } from "@testing-library/react";
import { IngestDropZone, INGEST_ACCEPT } from "./IngestDropZone";
import { installFileDropGuard } from "@/lib/fileDropGuard";

afterEach(cleanup);

const pdf = () => new File(["%PDF-1.4\n"], "PCN26-117.pdf", { type: "application/pdf" });

function mount() {
  const onFileSelected = vi.fn();
  const { container } = render(<IngestDropZone onFileSelected={onFileSelected} />);
  const zone = container.querySelector("[data-ingest-drop]") as HTMLElement;
  const input = container.querySelector("[data-ingest-file-input]") as HTMLInputElement;
  return { zone, input, onFileSelected };
}

describe("IngestDropZone — (b) the pill opens the chooser", () => {
  it("a click on the pill calls input.click()", () => {
    const { zone, input } = mount();
    const spy = vi.spyOn(input, "click").mockImplementation(() => {});
    fireEvent.click(zone);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("Enter and Space on the focused pill call input.click() (the keyboard path)", () => {
    const { zone, input } = mount();
    const spy = vi.spyOn(input, "click").mockImplementation(() => {});
    expect(zone.getAttribute("role")).toBe("button");
    expect(zone.tabIndex).toBe(0);
    fireEvent.keyDown(zone, { key: "Enter" });
    fireEvent.keyDown(zone, { key: " " });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("the input accepts PDF and XML, and a chosen file reaches onFileSelected", () => {
    const { input, onFileSelected } = mount();
    expect(input.accept).toBe(INGEST_ACCEPT);
    expect(input.accept).toMatch(/application\/pdf/);
    expect(input.accept).toMatch(/\.xml/);
    const f = pdf();
    fireEvent.change(input, { target: { files: [f] } });
    expect(onFileSelected).toHaveBeenCalledWith(f);
  });
});

describe("IngestDropZone — (a) a drop on the pill is cancelled and stopped", () => {
  it.each(["dragEnter", "dragOver", "drop"] as const)("%s: preventDefault AND stopPropagation", (type) => {
    const { zone } = mount();
    const outer = vi.fn();
    document.body.addEventListener(type.toLowerCase(), outer);
    const ev = createEvent[type](zone, { dataTransfer: { files: [pdf()], types: ["Files"] } });
    fireEvent(zone, ev);
    document.body.removeEventListener(type.toLowerCase(), outer);
    expect(ev.defaultPrevented, "an uncancelled file drop is a navigation").toBe(true);
    expect(outer, "the drag reached an ancestor's handler").not.toHaveBeenCalled();
  });

  it("the dropped file reaches onFileSelected", () => {
    const { zone, onFileSelected } = mount();
    const f = pdf();
    fireEvent.drop(zone, { dataTransfer: { files: [f], types: ["Files"] } });
    expect(onFileSelected).toHaveBeenCalledWith(f);
  });
});

describe("installFileDropGuard — a drop that MISSES the zone never navigates", () => {
  const fire = (type: "dragover" | "drop", types: string[]) => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, "dataTransfer", { value: { types } });
    document.body.dispatchEvent(ev);
    return ev.defaultPrevented;
  };

  it("cancels dragover and drop when the drag carries Files", () => {
    const off = installFileDropGuard(window);
    try {
      expect(fire("dragover", ["Files"])).toBe(true);
      expect(fire("drop", ["Files"])).toBe(true);
    } finally {
      off();
    }
  });

  it("leaves a canvas chip drag (text/plain) alone, and is gone once uninstalled", () => {
    const off = installFileDropGuard(window);
    expect(fire("dragover", ["text/plain"])).toBe(false);
    expect(fire("drop", ["text/plain"])).toBe(false);
    off();
    expect(fire("drop", ["Files"])).toBe(false);
  });
});
