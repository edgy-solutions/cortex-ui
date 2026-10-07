/**
 * `fromMaintenanceBridge.ts`'s seals: the projector's three arms, a mixed-card render proving it
 * draws through the SAME `WorkflowCase` as a hand-built fixture, and a census proving
 * `MAINTENANCE_BRIDGE_MAPPED` ∪ `MAINTENANCE_BRIDGE_UNDRAWN` is the WHOLE field population the
 * wire mirror declares — not a hand count of it.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { archetypePackage } from "../registry";
import { WORKFLOW_CASE_FIXTURES } from "./fixtures";
import { MAINT_ACTION_APPROVED, MAINT_ACTION_REJECTED, MAINT_EVENT } from "./fixtures/maintenanceBridge";
import {
  caseFromMaintenanceBridge,
  MAINTENANCE_BRIDGE_MAPPED,
  MAINTENANCE_BRIDGE_UNDRAWN,
} from "./fromMaintenanceBridge";
import { MIRRORED_FIELDS, type MirroredField } from "@/api/maintenanceBridgeTypes";

afterEach(() => cleanup());

const pkg = archetypePackage("WORKFLOW_CASE")!;
const Card = pkg.Card;

describe("caseFromMaintenanceBridge — arm 1, an approved action", () => {
  const payload = caseFromMaintenanceBridge(MAINT_EVENT, MAINT_ACTION_APPROVED);

  it("subject_ref is the asset, not the event record key", () => {
    expect(payload.subject_ref).toBe(MAINT_EVENT.asset_id);
  });

  it("the instance is completed, and history has one entry per source plus per chain entry", () => {
    expect(payload.instances).toHaveLength(1);
    expect(payload.instances[0].status).toBe("completed");
    expect(payload.history).toHaveLength(
      MAINT_EVENT.sources.length + MAINT_ACTION_APPROVED.approval_chain.length,
    );
  });

  it("draws the chain's own decision — 'approved' — on the card", () => {
    const { container } = render(<Card case={payload} />);
    const approvalEls = container.querySelectorAll("[data-approval]");
    expect(approvalEls).toHaveLength(MAINT_ACTION_APPROVED.approval_chain.length);
    const text = container.querySelector("[data-approvals]")!.textContent ?? "";
    expect(text).toContain("approved");
    expect(container.querySelector("[data-approvals-absent]")).toBeNull();
  });
});

describe("caseFromMaintenanceBridge — arm 2, a rejected action", () => {
  const payload = caseFromMaintenanceBridge(MAINT_EVENT, MAINT_ACTION_REJECTED);

  it("draws 'rejected', and never 'approved', in the approval chain", () => {
    const { container } = render(<Card case={payload} />);
    const text = container.querySelector("[data-approvals]")!.textContent ?? "";
    expect(text).toContain("rejected");
    expect(text).not.toContain("approved");
  });
});

describe("caseFromMaintenanceBridge — arm 3, the event alone, no action yet", () => {
  const payload = caseFromMaintenanceBridge(MAINT_EVENT);

  it("the instance is running, and approvals is OMITTED, never an empty array", () => {
    expect(payload.instances[0].status).toBe("running");
    expect(payload.approvals).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(payload, "approvals")).toBe(false);
  });

  it("history holds only the sources — nothing fabricated for a chain that does not exist", () => {
    expect(payload.history).toHaveLength(MAINT_EVENT.sources.length);
  });

  it("the card draws the absence, not an empty approvals section pretending to be a fact", () => {
    const { container } = render(<Card case={payload} />);
    expect(container.querySelectorAll("[data-approval]")).toHaveLength(0);
    expect(container.querySelector("[data-approvals-absent]")).not.toBeNull();
  });
});

describe("one card draws both the hand-built case and the bridge-derived one", () => {
  it("fixture 1 (HAZ-1003) and the bridge-derived case both render through the SAME Card import", () => {
    const fixture1 = WORKFLOW_CASE_FIXTURES[0];
    const bridgeCase = caseFromMaintenanceBridge(MAINT_EVENT, MAINT_ACTION_APPROVED);

    const a = render(<Card case={fixture1.payload} />);
    expect(a.container.querySelector('[data-archetype="WORKFLOW_CASE"]')).not.toBeNull();
    a.unmount();

    const b = render(<Card case={bridgeCase} />);
    expect(b.container.querySelector('[data-archetype="WORKFLOW_CASE"]')).not.toBeNull();
    b.unmount();
  });
});

describe("the census — MAPPED ∪ UNDRAWN is the whole field population, mechanically", () => {
  /** Walks `MIRRORED_FIELDS`, following the one `"WireX"` / `"readonly WireX[]"` convention the
   *  table's own header commits to — never re-deriving the Wire* interfaces by hand. */
  function leafPaths(prefix: string, className: keyof typeof MIRRORED_FIELDS): string[] {
    const fields = MIRRORED_FIELDS[className] as Record<string, MirroredField>;
    const out: string[] = [];
    for (const [name, field] of Object.entries(fields)) {
      const path = `${prefix}.${name}`;
      const obj = /^Wire([A-Za-z0-9]+)$/.exec(field.ts);
      const arr = /^readonly Wire([A-Za-z0-9]+)\[\]$/.exec(field.ts);
      if (obj) {
        out.push(...leafPaths(path, obj[1] as keyof typeof MIRRORED_FIELDS));
      } else if (arr) {
        out.push(...leafPaths(`${path}[]`, arr[1] as keyof typeof MIRRORED_FIELDS));
      } else {
        out.push(path);
      }
    }
    return out;
  }

  const CENSUS = [...leafPaths("event", "MaintenanceEvent"), ...leafPaths("action", "ActionRecord")];

  it("neither list has a duplicate, and the two lists do not overlap", () => {
    expect(new Set(MAINTENANCE_BRIDGE_MAPPED).size).toBe(MAINTENANCE_BRIDGE_MAPPED.length);
    expect(new Set(MAINTENANCE_BRIDGE_UNDRAWN).size).toBe(MAINTENANCE_BRIDGE_UNDRAWN.length);
    const overlap = MAINTENANCE_BRIDGE_MAPPED.filter((p) => (MAINTENANCE_BRIDGE_UNDRAWN as readonly string[]).includes(p));
    expect(overlap).toEqual([]);
  });

  it("MAPPED ∪ UNDRAWN equals every leaf field MIRRORED_FIELDS actually declares", () => {
    const declared = [...MAINTENANCE_BRIDGE_MAPPED, ...MAINTENANCE_BRIDGE_UNDRAWN].slice().sort();
    expect(declared).toEqual(CENSUS.slice().sort());
  });
});

// The spec's own instruction: swap the SDK test-builder inputs for Lane 1's `/cases/{id}` capture
// once it is served — the projector's signature does not change, only what calls it.
it.todo("swap to Lane 1's /cases/{id} capture when served — the projector's inputs are then read off the wire, not the SDK test builders");
