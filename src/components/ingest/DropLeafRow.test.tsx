import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { DropLeafRow } from "./DropLeafRow";

afterEach(cleanup);
const opts = () => [...document.querySelectorAll("[data-ingest-leaf-option]")].map((e) => e.getAttribute("data-ingest-leaf-option"));

describe("DropLeafRow", () => {
  it("renders exactly the given leaves in order, then Not sure", () => {
    render(<DropLeafRow leaves={["pdn", "pcn"]} value={null} onChange={() => {}} />);
    expect(opts()).toEqual(["pdn", "pcn", "unsure"]);
    expect([...document.querySelectorAll("[role=radio]")].map((e) => e.textContent)).toEqual(["PDN", "PCN", "Not sure"]);
    expect(document.querySelector("[data-ingest-leaf-none]")).toBeNull();
  });
  it("empty leaves renders Not sure and the none line", () => {
    render(<DropLeafRow leaves={[]} value={null} onChange={() => {}} />);
    expect(opts()).toEqual(["unsure"]);
    expect(document.querySelector("[data-ingest-leaf-none]")?.textContent).toBe("No document kinds served for your account");
  });
});
