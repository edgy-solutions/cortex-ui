/**
 * SEAL (201): no JSON in an answer card. (a) the source of every file that draws an undeclared or
 * fenced payload never serialises to JSON text; (b) a render census through SemanticInterpreter
 * finds no `pre` and no text node that is itself parseable JSON.
 */
import type React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { SemanticInterpreter } from "@/components/registry/SemanticInterpreter";
import { RawFields } from "./RawFields";
import { DRAFT_URI, FRS_URI, asDocument } from "@/renders/fixtures/safetyReplies.derived";

afterEach(cleanup);

const root = path.join(__dirname, "..");
const rendersDir = path.join(root, "renders");

describe("(a) source: no JSON.stringify in the answer-card files", () => {
  const files = [
    "archetypes/StructuredFields.tsx",
    "archetypes/RawFields.tsx",
    "archetypes/knowledge-document/Card.tsx",
    "components/registry/SemanticInterpreter.tsx",
    ...readdirSync(rendersDir)
      .filter((f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"))
      .map((f) => `renders/${f}`),
  ];
  it("the file population is explicit", () => {
    expect(files.length).toBe(6);
    expect(files).toContain("renders/RiskAssessmentDraftCard.tsx");
    expect(files).toContain("renders/FailureRecordSetCard.tsx");
  });
  it.each(files)("%s", (f) => {
    expect(readFileSync(path.join(root, f), "utf8")).not.toContain("JSON.stringify(");
  });
  it("StructuredFields.tsx draws no <pre>", () => {
    expect(readFileSync(path.join(root, "archetypes/StructuredFields.tsx"), "utf8")).not.toMatch(/<pre[\s>]/);
  });
});

const REASON = "no failures recorded for part '5530-184': no source this engine reads holds a failure for it";
const nested = { a: { b: [1, { c: 2 }] }, list: ["x"] };

const CENSUS: [string, () => React.ReactElement][] = [
  ["unknown archetype", () => <SemanticInterpreter payload={{ components: [{ archetype: "NOT_A_THING", x: nested }] }} />],
  [
    "package fall-through (WORKFLOW_CASE with no case)",
    () => <SemanticInterpreter payload={{ components: [{ archetype: "WORKFLOW_CASE", zz: nested }] }} />,
  ],
  [
    "the screenshot refusal",
    () => (
      <SemanticInterpreter
        payload={{
          components: [
            {
              archetype: "KNOWLEDGE_DOCUMENT",
              refusal: { refused: true, outcome: "no_failures_recorded", reason: REASON },
              ...asDocument({ refused: true, outcome: "no_failures_recorded", reason: REASON, output_uri: FRS_URI }),
              zz: nested,
            },
          ],
        }}
      />
    ),
  ],
  ["a degraded draft", () => <SemanticInterpreter payload={{ components: [asDocument({ refused: false, output_uri: DRAFT_URI })] }} />],
  ["a degraded FailureRecordSet", () => <SemanticInterpreter payload={{ components: [asDocument({ refused: false, output_uri: FRS_URI })] }} />],
  [
    "a fence with an unknown output_uri",
    () => <SemanticInterpreter payload={{ components: [asDocument({ output_uri: "http://x/y#Z", nested })] }} />,
  ],
  ["RawFields with nested values", () => <RawFields fields={{ nested, arr: [nested], s: "plain" }} />],
];

describe("(b) render census: no pre, no JSON text node", () => {
  it("the census population is explicit", () => {
    expect(CENSUS.length).toBe(7);
  });

  it.each(CENSUS)("%s", (_name, make) => {
    const { container } = render(make());
    expect(container.querySelector("pre")).toBeNull();
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    const bad: string[] = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = (n.textContent ?? "").trim();
      if (!/^[{[]/.test(t)) continue;
      try {
        JSON.parse(t);
        bad.push(t);
      } catch {
        /* not JSON */
      }
    }
    expect(bad).toEqual([]);
    expect(container.textContent!.length).toBeGreaterThan(0);
  });
});

describe("(c) the line says WHICH failure: no render, or a render that did not draw", () => {
  it("an unknown archetype: 'no render registered for', and not the not-drawn line", () => {
    const { container } = render(<SemanticInterpreter payload={{ components: [{ archetype: "NOT_A_THING" }] }} />);
    expect(container.querySelector('[data-no-render-registered="NOT_A_THING"]')).not.toBeNull();
    expect(container.querySelector("[data-render-not-drawn]")).toBeNull();
  });

  it("a registered package that falls through: 'render not drawn', never 'no render registered'", () => {
    const { container } = render(<SemanticInterpreter payload={{ components: [{ archetype: "WORKFLOW_CASE" }] }} />);
    expect(container.querySelector("[data-no-render-registered]")).toBeNull();
    expect(container.querySelector('[data-render-not-drawn="WORKFLOW_CASE"]')!.textContent).toMatch(
      /^WORKFLOW_CASE render not drawn: /,
    );
  });
});
