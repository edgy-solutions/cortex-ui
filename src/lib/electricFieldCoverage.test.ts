/**
 * TWO WRITERS AND A HAND-WRITTEN LIST BETWEEN THEM.
 *
 * ── WHAT THIS REPLACES ────────────────────────────────────────────────────────────────────
 *
 * An artifact row has two producers: `rowToArtifact` maps the Electric projection of the
 * substrate, and the local path (`createPendingArtifact`, the onError fallback, the task-batch
 * fetch) writes client-side liveness. Which fields belong to which was recorded as a
 * hand-maintained constant, `ELECTRIC_COVERED_FIELDS`, and an absence probe reads it to assert
 * that no `sse:*` write is the last one standing on a substrate-owned field.
 *
 * The probe is good and its floor is real. What nothing checked was THE LIST ITSELF. A field
 * added to the projection is covered by the probe only if someone also remembers to add it
 * here, and forgetting is silent in the direction that matters: the probe simply never asks
 * about that field, and reports green over it forever.
 *
 * That is a docstring agreement between two producers, which is the thing the LangGraph lane's
 * card and routing record had before they disagreed in production. So it is DERIVED now, and
 * the constant is checked against the projection rather than trusted as its description.
 *
 * ── DERIVE BOTH SIDES, AND FLOOR THE DERIVATION ───────────────────────────────────────────
 *
 * The lesson that makes this worth writing at all: a scrape that reads too little FAILS OPEN.
 * The same sweep on the LangGraph side silently read 4 keys instead of 19 because the dict was
 * an annotated assignment and the walk only handled plain ones — it would have passed while
 * checking almost nothing, and its floor is what caught it. So the walk below asserts how much
 * it found before it asserts anything about what it found.
 *
 * ── AND IT IS ONE-WAY, DELIBERATELY ───────────────────────────────────────────────────────
 *
 * Equality would be wrong. The projection legitimately carries fields the probe must NOT demand
 * from Electric: `question_text` and `message_id` are captured locally at turn start and the
 * store preserves the local value on purpose, and `produced_for` has a real local writer in the
 * task-batch path. The assertion is containment plus a classification: every projected field is
 * either covered or explicitly not, with a reason. A new field in the projection belongs to
 * neither set and fails here — which is the whole point, because today it would simply go
 * unwatched.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { parseSourceOrThrow } from "@/lib/parseSource";
import { ELECTRIC_COVERED_FIELDS } from "@/store/useCanvasStore";

/**
 * Every property the Electric mapper actually sets, read off its returned object literal.
 *
 * Read from the SOURCE rather than by calling `rowToArtifact` with a fixture row, because a
 * fixture is a third hand-written list and would drift from the projection exactly like the
 * constant this file exists to check. The subject has to produce the population.
 */
function projectedFields(): string[] {
  const file = path.join(__dirname, "electric.ts");
  const sf = parseSourceOrThrow(file, readFileSync(file, "utf8"), ts.ScriptKind.TS);
  const found: string[] = [];

  const collect = (node: ts.Node): void => {
    if (
      ts.isFunctionDeclaration(node) &&
      node.name?.text === "rowToArtifact" &&
      node.body
    ) {
      // The mapper's own `return { ... }` — not a nested helper's.
      for (const stmt of node.body.statements) {
        if (!ts.isReturnStatement(stmt) || !stmt.expression) continue;
        if (!ts.isObjectLiteralExpression(stmt.expression)) continue;
        for (const prop of stmt.expression.properties) {
          const name = prop.name;
          if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name))) {
            found.push(name.text);
          }
        }
      }
      return;
    }
    ts.forEachChild(node, collect);
  };
  ts.forEachChild(sf, collect);
  return found;
}

/**
 * Projected fields the probe deliberately does NOT demand from Electric, each with the reason.
 *
 * A comment in a constant is what this file is replacing, so these are not comments — a field
 * listed here is a DECISION, and a field in neither set is an omission that fails the suite.
 */
const LOCALLY_AUTHORITATIVE: Record<string, string> = {
  id: "the row's identity, created locally at turn start",
  created_at: "set when the local pending row is appended",
  updated_at: "stamped by the store on every write, local or projected",
  valid_as_of: "bookkeeping the store maintains alongside the projection",
  valid_until: "bookkeeping the store maintains alongside the projection",
  question_text:
    "captured locally at create-pending and PRESERVED over the projection on purpose — the " +
    "user is already reading it, and letting the echo win would change text mid-turn",
  message_id: "captured locally at create-pending, same preservation rule as question_text",
  produced_for:
    "has a real local writer: the task-batch path in taskArtifact.ts builds it client-side, " +
    "so demanding an Electric tag on it would fail for a legitimate local write",
};

describe("the Electric projection is read, not described", () => {
  const projected = projectedFields();

  it("the walk found a real population — the floor", () => {
    // A walk that found nothing would report perfect agreement and read as a clean bill of
    // health. That is the failure the LangGraph lane's identical sweep hit: its walk silently
    // read 4 of 19 keys, because the dict was an annotated assignment and the walk only handled
    // plain ones, and its floor was the ONLY thing that caught it.
    //
    // HERE THE FLOOR IS NOT THE CATCHER, and the difference is worth writing down rather than
    // claiming a guard that is doing no work. A compound mutation — empty the walk AND delete
    // this floor — is still red, because three assertions below independently require the walk
    // to have found things: containment against a NON-EMPTY constant, the named positive
    // control, and the stale-exclusion check. Their populations cannot both be empty.
    //
    // So the rule sharpens: a floor is load-bearing only where nothing else in the file depends
    // on the population being non-empty. It stays anyway — it is one line, it fails with a far
    // clearer message than three downstream assertions failing at once, and the day someone
    // empties that constant it becomes the only guard again.
    expect(projected.length, projected.join(", ")).toBeGreaterThanOrEqual(15);
  });

  it("finds the mapper's OWN return, not a helper's object literal", () => {
    // Positive control on the walker's aim: these are unmistakably artifact fields, and a walk
    // that had latched onto some nested helper would not have them.
    expect(projected).toContain("rendered_output");
    expect(projected).toContain("durability_status");
    expect(projected).toContain("watermark");
  });

  it("every COVERED field is actually projected — the list cannot demand a phantom", () => {
    // The direction that would make the probe assert something Electric never sends: a covered
    // field absent from the projection can never carry an Electric tag, so the probe would fail
    // for a reason that has nothing to do with an SSE write clobbering it.
    const phantom = ELECTRIC_COVERED_FIELDS.filter((f) => !projected.includes(f as string));
    expect(phantom, `covered but never projected: ${phantom.join(", ")}`).toEqual([]);
  });

  it("every PROJECTED field is classified — covered, or locally authoritative with a reason", () => {
    // The direction that goes silent, and the reason this file exists. A field added to the
    // projection and not to the list is simply never asked about: the probe reports green over
    // it forever, and an `sse:*` write landing on substrate state is invisible.
    //
    // `derived_from_artifact_id` was exactly this. It arrives only via the projection, nothing
    // local writes it, and the entire ask-fold reads it as lineage — so an SSE path that started
    // writing it would have had the canvas following a client-invented parent, with no probe
    // able to notice. Same for `graph_trace_alternates`, whose own comment calls it a sibling of
    // the covered `graph_trace`.
    const unclassified = projected.filter(
      (f) =>
        !(ELECTRIC_COVERED_FIELDS as readonly string[]).includes(f) &&
        !(f in LOCALLY_AUTHORITATIVE),
    );
    expect(
      unclassified,
      `projected but neither covered nor declared local: ${unclassified.join(", ")}. ` +
        "Add it to ELECTRIC_COVERED_FIELDS, or to LOCALLY_AUTHORITATIVE with the reason.",
    ).toEqual([]);
  });

  it("the two sets do not overlap — a field cannot be both", () => {
    const both = ELECTRIC_COVERED_FIELDS.filter((f) => (f as string) in LOCALLY_AUTHORITATIVE);
    expect(both, `claimed by both: ${both.join(", ")}`).toEqual([]);
  });

  it("every locally-authoritative exclusion names a field that is really projected", () => {
    // Otherwise the exclusions become a graveyard: a field removed from the projection leaves
    // its excuse behind, and the next reader takes the excuse for a live decision.
    const stale = Object.keys(LOCALLY_AUTHORITATIVE).filter((f) => !projected.includes(f));
    expect(stale, `excused but no longer projected: ${stale.join(", ")}`).toEqual([]);
  });
});
