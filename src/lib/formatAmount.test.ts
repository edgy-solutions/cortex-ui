import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { formatAmount } from "./formatAmount";

describe("formatAmount currency symbol from the served unit", () => {
  it("keeps the four codes the old list had", () => {
    expect(formatAmount(1500000, "USD")).toBe("$1.5M");
    expect(formatAmount(1500000, "EUR")).toBe("€1.5M");
    expect(formatAmount(500, "GBP")).toBe("£500");
    expect(formatAmount(2000, "JPY")).toBe("¥2K");
  });

  it("draws codes the old list never had", () => {
    expect(formatAmount(1500000, "INR")).toBe("₹1.5M");
    expect(formatAmount(1500000, "KRW")).toBe("₩1.5M");
    expect(formatAmount(1500000, "CAD")).toBe("CA$1.5M");
    // Intl's own literal (U+00A0) after the code, written out by hand from a node probe.
    expect(formatAmount(1500, "CHF")).toBe("CHF 1.5K");
  });

  it("is case-insensitive on the code", () => {
    expect(formatAmount(1500000, "inr")).toBe("₹1.5M");
  });

  it("places the sign outside the symbol", () => {
    expect(formatAmount(-1500000, "INR")).toBe("-₹1.5M");
  });

  it("prints a raw value below 1000", () => {
    expect(formatAmount(999, "INR")).toBe("₹999");
  });

  it.each(["ZZZ", "XXX", "hours", "USD/hr", "%", "", undefined])(
    "shows magnitude only for %s",
    (unit) => {
      expect(formatAmount(1500000, unit)).toBe("1.5M");
    },
  );

  it("echoes blank and non-numeric values", () => {
    expect(formatAmount("", "USD")).toBe("");
    expect(formatAmount("n/a", "USD")).toBe("n/a");
  });

  it("holds no list of currencies in its source", () => {
    const src = readFileSync(path.join(__dirname, "./formatAmount.ts"), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const msg = "no list of currencies in cortex; the symbol comes from the served unit";
    expect(code, msg).not.toMatch(/[€£¥₹]/);
    expect(code, msg).not.toMatch(/["'][A-Z]{3}["']/);
  });
});
