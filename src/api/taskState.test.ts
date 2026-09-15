/**
 * ONE FACT, ONE DECLARATION — and the nine states nobody could receive.
 *
 * `task_state` was declared TWICE: six values in `TaskRef` and four inside
 * `ApprovalTaskPayload`. A task arriving `acknowledged` was therefore a type error at one
 * consumer and perfectly fine at the other, with the NARROWER copy silently governing whichever
 * surface imported it. That is the same shape as the join guard written this morning — two
 * declarations of one fact, each happy alone, drifting because nothing compares them.
 *
 * Both were also INCOMPLETE. The composed declaration (seed plus the in-repo sample overlay)
 * carries fifteen states across six species; cortex knew six of them.
 *
 * ⛔ THE RENDERER IS NOW AHEAD OF THE PRODUCER. The producer half landed at `ad29f5c` and is not
 * rolled, so nine of these cannot arrive yet. Safe direction — and their absence in the sandbox
 * is NOT evidence the values are wrong, the same note the `no_outcome` branch carries.
 *
 * ── FIXTURE PROVENANCE ────────────────────────────────────────────────────────────────────
 *
 * The fifteen are invincible-agent-65's measurement against the composed declaration, not my own
 * read and not a summary: `redrafted` and `withdrawn` were ABSENT from the list relayed earlier
 * and present in the measurement. So this list inherits their read — acceptable for a renderer,
 * and the reason it is written down rather than assumed.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { TaskState } from "./types";

/** The measured union, as a value, so the compiler checks it against the type. */
const ALL_STATES: TaskState[] = [
  "pending",
  "approved",
  "rejected",
  "expired",
  "acknowledged",
  "redriven",
  "accepted",
  "concurred",
  "not_concurred",
  "returned_for_rework",
  "linked",
  "new_hazard",
  "dismissed",
  "redrafted",
  "withdrawn",
];

/**
 * A `task_state` FIELD typed with an inline literal union — i.e. a second declaration.
 *
 * Requires a `|` AFTER the first quoted literal, which is what separates a TYPE from a VALUE:
 * `task_state: "pending" as const` in a fixture is an assignment and must not match, or this
 * check fires on every fixture in the repo and gets deleted for crying wolf. That co-occurrence
 * trap has bitten this codebase five times.
 */
const INLINE_UNION = /task_state\??:\s*"[^"]*"\s*\|/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

describe("task_state is declared once, and completely", () => {
  it("carries all fifteen measured states", () => {
    // The compiler does the real work: a value outside `TaskState` fails to typecheck above.
    // This asserts the COUNT, which the compiler cannot — a union missing a member still
    // typechecks against a shorter list.
    expect(new Set(ALL_STATES).size).toBe(15);
  });

  it("includes the two that the relayed summary omitted", () => {
    // Named individually because they are the evidence for preferring a measurement over a
    // summary. If a future edit trims the union back to a remembered list, these go first.
    expect(ALL_STATES).toContain("redrafted");
    expect(ALL_STATES).toContain("withdrawn");
  });

  it("keeps `pending`, which the producer refuses to STORE but the queue reads as open", () => {
    // Not a resolution — the producer will never send it as an outcome — but it is the state a
    // task is in before it resolves, and every `=== "pending"` check in the UI depends on it.
    // Dropping it as "not a terminal state" would break the open/resolved split entirely.
    expect(ALL_STATES).toContain("pending");
  });

  it("is not redeclared anywhere else in the tree", () => {
    // THE DRIFT GUARD. Both copies typechecked; nothing compared them, so the narrow one
    // governed its own surface for as long as it existed.
    const offenders = sourceFiles("src")
      // THIS FILE IS EXEMPT AND ONLY THIS FILE: its positive control below contains the pattern
      // deliberately. Exempting all tests instead would let a fixture hide a real declaration,
      // and exempting nothing makes the guard permanently red against itself.
      .filter((f) => !f.endsWith("taskState.test.ts"))
      .filter((f) => INLINE_UNION.test(readFileSync(f, "utf8")));
    expect(offenders, "task_state redeclared as an inline union — reference TaskState instead").toEqual(
      [],
    );
  });

  it("and the guard above can actually fire — the positive control", () => {
    // A scan that matches nothing proves nothing about the tree; it may simply be broken. This
    // is the `\b`-became-a-backspace lesson: a seal that cannot fail is not a seal.
    expect(INLINE_UNION.test('  task_state?: "pending" | "approved";')).toBe(true);
    // And it must NOT fire on a fixture assignment, or it gets deleted for crying wolf.
    expect(INLINE_UNION.test('  task_state: "pending" as const,')).toBe(false);
    expect(INLINE_UNION.test("  task_state: TaskState;")).toBe(false);
  });
});
