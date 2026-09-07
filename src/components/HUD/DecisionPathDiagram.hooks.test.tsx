/**
 * THE HOOK COUNT MUST NOT DEPEND ON WHETHER ANYTHING HAS ROUTED YET.
 *
 * `DecisionPathDiagram` returns null before a routing decision exists — correct, and the kind
 * of guard this codebase writes everywhere. But a hook was added BELOW that return, beside the
 * value it feeds, which reads naturally and is a Rules-of-Hooks violation: the render before a
 * route decision ran five hooks and the render after it ran six.
 *
 * REACT DOES NOT DEGRADE HERE, IT THROWS. Minified error #310, "rendered more hooks than
 * during the previous render", on the FIRST route decision of every session — which is to say
 * on the first question anyone asks. It reached production, and no test caught it because
 * every existing test mounted the component in one state and asserted about that state. The
 * defect lives in the TRANSITION between two states, and a fixture that starts populated
 * cannot see it.
 *
 * So this file mounts the component EMPTY and then populates the store, which is the sequence
 * a real session performs and the only sequence that fails.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, act } from "@testing-library/react";
import type { Artifact, RouteDecision } from "@/api/types";
import { DecisionPathDiagram } from "./DecisionPathDiagram";
import { useCanvasStore } from "@/store/useCanvasStore";

const ROUTING: RouteDecision = {
  about: { label: "Capability", uri: "urn:x:Capability", confidence: 0.9 },
  action: {
    label: "plan Capability Path",
    iri: "mesh:planCapabilityPath",
    confidence: 0.9,
    classify_called: true,
    candidate_count: 1,
  },
  handled_by: {
    engine_name: "Engine O",
    provider: "engine_o_plan_capability_path",
    endpoint_url: "http://engine-o:8081/analyze",
  },
};

const row = (id: string, overrides: Partial<Artifact> = {}): Artifact =>
  ({
    id,
    created_at: 500,
    updated_at: 600,
    valid_as_of: 500,
    valid_until: null,
    question_text: "which capability?",
    summary: "",
    resolved_intent: {},
    message_id: `msg-${id}`,
    status: "complete",
    rendered_output: { components: [] },
    produced_by: { actor_type: "agent", actor_id: "engine_o" },
    produced_for: { user_id: "alice", is_authenticated: true, entitlement_source: "none" },
    routing: ROUTING,
    sources: [],
    graph_trace: [],
    graph_trace_alternates: [],
    derived_from_artifact_id: null,
    durability_status: "durable",
    watermark: 42,
    ...overrides,
  }) as unknown as Artifact;

/**
 * React reports a hooks-order violation by THROWING during render, and testing-library lets
 * that propagate — but React also logs it, and a suite that prints the error while passing is
 * how this class stays invisible. The spy makes the throw the only signal.
 */
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
});

afterEach(() => {
  cleanup();
  errorSpy.mockRestore();
});

describe("the hook count is the same before and after a routing decision arrives", () => {
  it("survives the empty → routed transition, which is what production does", () => {
    // MOUNTED EMPTY FIRST. This is the whole test: the component renders once with no routing
    // (the state every session starts in, while `[electric] no token yet` is still true), and
    // the store is then populated in place. A hook below the early return makes THIS render
    // throw #310 — not the mount, and not a mount that began populated.
    const { container } = render(<DecisionPathDiagram />);
    expect(container.firstChild).toBeNull();

    expect(() => {
      act(() => {
        useCanvasStore.setState({ artifacts: [row("a1")], currentArtifactId: "a1" });
      });
    }).not.toThrow();

    // Red-proofs the transition: if the component rendered nothing in BOTH states the
    // assertion above would pass while testing nothing at all.
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toMatch(/Decision Path/);
  });

  it("survives routed → empty as well, since a session can clear the canvas", () => {
    useCanvasStore.setState({ artifacts: [row("a1")], currentArtifactId: "a1" });
    const { container } = render(<DecisionPathDiagram />);
    expect(container.firstChild).not.toBeNull();

    expect(() => {
      act(() => {
        useCanvasStore.setState({ artifacts: [], currentArtifactId: null });
      });
    }).not.toThrow();
    expect(container.firstChild).toBeNull();
  });

  it("does not merely swallow React's complaint — nothing was logged either", () => {
    // A hooks violation React recovers from would still reach console.error, and a component
    // that "passes" while logging one is the shape this file exists to refuse.
    render(<DecisionPathDiagram />);
    act(() => {
      useCanvasStore.setState({ artifacts: [row("a1")], currentArtifactId: "a1" });
    });
    const complaints = errorSpy.mock.calls
      .map((c: unknown[]) => String(c[0] ?? ""))
      .filter((m: string) => /hook|#310|Rendered more/i.test(m));
    expect(complaints).toEqual([]);
  });
});

describe("no hook sits below the early return, as source", () => {
  it("every use* call in the component body precedes `if (!routing) return null`", () => {
    // The behavioural tests above catch THIS instance. This one catches the next one, because
    // the natural place to add a hook is beside the value it feeds — which is below the guard.
    const src = readFileSync(path.join(__dirname, "DecisionPathDiagram.tsx"), "utf8");
    const body = src.slice(
      src.indexOf("export function DecisionPathDiagram()"),
      src.indexOf("export function DecisionPathDiagram()") + 6000,
    );
    const guard = body.indexOf("if (!routing) return null;");
    expect(guard, "the early return moved or was renamed — re-point this guard").toBeGreaterThan(0);
    const after = body.slice(guard);
    // Trim at the JSX, where `use*` can only appear inside a nested component's own body.
    const hooksAfter = after.slice(0, after.indexOf("return (")).match(/\buse[A-Z]\w*\s*\(/g);
    expect(hooksAfter, `hook called after the early return: ${hooksAfter?.join(", ")}`).toBeNull();
    // Positive control: the hooks that SHOULD be there are, above the guard.
    expect(body.slice(0, guard)).toMatch(/useAskedBy\(artifact\)/);
  });
});
