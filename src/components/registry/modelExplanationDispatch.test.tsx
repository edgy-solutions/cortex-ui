import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SemanticInterpreter } from "./SemanticInterpreter";
import { MODEL_EXPLANATION_FIXTURES } from "@/archetypes/model-explanation/fixtures";

const payload = {
  components: [{ archetype: "MODEL_EXPLANATION", model_explanation: MODEL_EXPLANATION_FIXTURES[0].payload }],
};

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("SemanticInterpreter dispatches MODEL_EXPLANATION behind modelCanvas", () => {
  it("flag off: the honest panel, not the card", () => {
    localStorage.clear();
    render(<SemanticInterpreter payload={payload} />);
    expect(document.querySelector('[data-model-canvas="off"]')).not.toBeNull();
    expect(document.querySelector('[data-archetype="MODEL_EXPLANATION"]')).toBeNull();
  });

  it("flag on: the card, not the panel", () => {
    localStorage.setItem("cortex.modelCanvas", "1");
    render(<SemanticInterpreter payload={payload} />);
    expect(document.querySelector('[data-archetype="MODEL_EXPLANATION"]')).not.toBeNull();
    expect(document.querySelector('[data-model-canvas="off"]')).toBeNull();
  });

  it("no model_explanation object draws neither, flag on or off", () => {
    for (const on of [false, true]) {
      if (on) localStorage.setItem("cortex.modelCanvas", "1");
      render(<SemanticInterpreter payload={{ components: [{ archetype: "MODEL_EXPLANATION" }] }} />);
      expect(document.querySelector('[data-archetype="MODEL_EXPLANATION"]')).toBeNull();
      expect(document.querySelector('[data-model-canvas="off"]')).toBeNull();
      cleanup();
    }
  });
});
