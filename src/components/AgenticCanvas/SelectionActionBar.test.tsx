import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { SelectionActionBar } from "./SelectionActionBar";

afterEach(cleanup);

function mount(onExport?: () => void) {
  const h = { onAdd: vi.fn(), onNew: vi.fn(), onClear: vi.fn() };
  const r = render(<SelectionActionBar count={2} canvases={[{ id: "c1", name: "Board" }]} {...h} onExport={onExport} />);
  return { h, ...r };
}

describe("SelectionActionBar", () => {
  it("has no export button without onExport", () => {
    const { container } = mount();
    expect(container.querySelector("[data-export-as]")).toBeNull();
  });
  it("with onExport, the button is present and a click calls it", () => {
    const onExport = vi.fn();
    const { container } = mount(onExport);
    fireEvent.click(container.querySelector("[data-export-as]")!);
    expect(onExport).toHaveBeenCalledTimes(1);
  });
  it("add-to-canvas and New still call their handlers", () => {
    const { container, h, getByText } = mount();
    fireEvent.click(getByText("Board"));
    expect(h.onAdd).toHaveBeenCalledWith("c1");
    fireEvent.click(getByText("New"));
    expect(h.onNew).toHaveBeenCalledTimes(1);
    fireEvent.click(container.querySelector('[title="Clear selection"]')!);
    expect(h.onClear).toHaveBeenCalledTimes(1);
  });
});
