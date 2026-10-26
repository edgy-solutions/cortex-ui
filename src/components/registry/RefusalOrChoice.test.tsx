/**
 * THE CHAT PATH: a refusal envelope that carries an ask draws a CHOICE; one that does not draws
 * `RefusalCard` exactly as before. Through `SemanticInterpreter`'s real dispatch.
 *
 * The `ask` on the envelope is a CORTEX PROPOSAL (unratified), the #97 409's shape carried on the
 * chat path's own refusal envelope.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SemanticInterpreter } from "./SemanticInterpreter";
import { readRefusalEnvelope } from "@/lib/refusalEnvelope";
import { REFUSAL_ENVELOPE_WITH_ASK } from "@/lib/financeSeedAskFixture";

afterEach(cleanup);

const draw = (comp: object) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <SemanticInterpreter payload={{ components: [comp] }} />
    </QueryClientProvider>,
  );

describe("a refusal envelope that carries an ask", () => {
  it("(f) draws the option, with the outcome token in slate, and not the red card", () => {
    draw(REFUSAL_ENVELOPE_WITH_ASK);
    expect(document.querySelector("[data-refusal-choice]")).not.toBeNull();
    expect(document.querySelectorAll("[data-ask-option]")).toHaveLength(1);
    expect(document.querySelector("[data-ask-option]")?.getAttribute("data-ask-option")).toBe("NP-MERIDIAN");
    const outcome = document.querySelector("[data-refusal-outcome]");
    expect(outcome?.getAttribute("data-refusal-outcome")).toBe("unbound_required_slot");
    expect(outcome?.getAttribute("class")).not.toMatch(/text-(rose|red|amber)-/);
    expect(document.querySelector("[data-refusal]")).toBeNull();
  });

  it("an envelope without an ask still draws data-refusal", () => {
    const { container } = draw({
      archetype: "KNOWLEDGE_DOCUMENT",
      refusal: { refused: true, outcome: "source_unavailable", reason: "the connector could not read" },
    });
    expect(document.querySelector("[data-refusal]")).not.toBeNull();
    expect(document.querySelector("[data-refusal-choice]")).toBeNull();
    expect(container.textContent).toContain("the connector could not read");
  });

  it("an unusable ask degrades to the refusal card, never to nothing", () => {
    draw({
      archetype: "KNOWLEDGE_DOCUMENT",
      refusal: { refused: true, outcome: "x", reason: "r", ask: { slot: "" } },
    });
    expect(document.querySelector("[data-refusal]")).not.toBeNull();
  });
});

describe("readRefusalEnvelope with an ask", () => {
  it("an envelope with no ask is byte-identical to before: no ask key at all", () => {
    const env = readRefusalEnvelope({ refusal: { refused: true, outcome: "o", reason: "r" } })!;
    expect(env).toEqual({ refused: true, outcome: "o", reason: "r" });
    expect("ask" in env).toBe(false);
  });
  it("carries the validated ask, and does not demand a binding_slot", () => {
    const env = readRefusalEnvelope(REFUSAL_ENVELOPE_WITH_ASK)!;
    expect(env.ask?.options).toEqual([{ value: "NP-MERIDIAN", label: "Notional Program Meridian" }]);
    expect("binding_slot" in (env.ask ?? {})).toBe(false);
  });
});

/** The population, counted over the source tree rather than assumed from the two sites known. */
describe("the population census", () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) files.push(p);
    }
  };
  walk(join(__dirname, "..", ".."));
  const withText = (re: RegExp) =>
    files.filter((f) => re.test(readFileSync(f, "utf8"))).map((f) => f.replace(/\\/g, "/").split("/src/")[1]);

  it("<RefusalCard is mounted only inside RefusalOrChoice", () => {
    expect(withText(/<RefusalCard\b/)).toEqual(["components/registry/RefusalOrChoice.tsx"]);
  });

  it("<AskCard with an onReroute is in RefusalWithAsk and AskCardConnected, nowhere else", () => {
    const hits = withText(/<AskCard\b[^>]*?onReroute=|<AskCard\s[\s\S]*?onReroute=/).sort();
    expect(hits).toEqual([
      "components/elicitation/AskCardConnected.tsx",
      "components/elicitation/RefusalWithAsk.tsx",
    ]);
  });
});
