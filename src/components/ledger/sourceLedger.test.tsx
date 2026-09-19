/**
 * SOURCE_LEDGER — the card, and the first fixture set with TWO PRODUCING CONTEXTS.
 *
 * The three archetypes extracted before this one each had ONE producer, so "every declared
 * absence flips in both directions" read as a fact about the archetype. It is a fact about a
 * CONTEXT: which dispositions a graph can emit is a function of its `refusal` clause. A `fail`
 * graph RAISES on a refused inner call and never returns a row for one, so the two hole terms
 * are unreachable for it BY CONTRACT.
 *
 * ⛔ ASSERTING A HOLE FLIPS ON A `fail` PRODUCER WOULD ASSERT WHAT ITS CONTRACT FORBIDS. So the
 * flip property below is scoped per producer, and a card built expecting a hole would be wrong
 * on every cost review.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, screen } from "@testing-library/react";
import { SourceLedger } from "./SourceLedger";
import { validateSourceLedger } from "./SourceLedger.contract";
import { LEDGER_ABSENCES, LEDGER_FIXTURES, type RefusalClause } from "./fixtures/sourceLedger";

afterEach(cleanup);

/** Mirrors the producer's `reachable_for`. A `fail` graph cannot return a hole row. */
const HOLE_ABSENCES = new Set<string>(["data-ledger-hole", "data-ledger-no-artifact"]);
const reachableFor = (clause: RefusalClause) =>
  LEDGER_ABSENCES.filter((a) => clause === "named-hole" || !HOLE_ABSENCES.has(a));

describe("SOURCE_LEDGER fixtures discriminate, per producing context", () => {
  it.each(LEDGER_FIXTURES.map((f) => [f.name, f] as const))(
    "%s — declares exactly what it names",
    (_name, f) => {
      render(<SourceLedger component={f.component} />);
      for (const absence of LEDGER_ABSENCES) {
        const present = document.querySelector(`[${absence}]`) !== null;
        const expected = f.declares.includes(absence);
        expect(present, `${absence} expected ${expected ? "present" : "ABSENT"}`).toBe(expected);
      }
    },
  );

  it("every REACHABLE absence flips within its producer, and no unreachable one is demanded", () => {
    for (const clause of ["named-hole", "fail"] as RefusalClause[]) {
      const mine = LEDGER_FIXTURES.filter((f) => f.producers.includes(clause));
      for (const absence of reachableFor(clause)) {
        expect(
          mine.some((f) => f.declares.includes(absence)),
          `${absence} is never declared by a ${clause} fixture`,
        ).toBe(true);
        expect(
          mine.some((f) => !f.declares.includes(absence)),
          `${absence} is declared by EVERY ${clause} fixture — it cannot flip`,
        ).toBe(true);
      }
    }
  });

  it("⛔ NO `fail` FIXTURE CLAIMS A HOLE — the contract forbids the outcome", () => {
    // The control on the property above. Without it, "flips per producer" would be satisfied by
    // a set that quietly gave the fail producer a hole anyway, and the card would be built
    // expecting one on every cost review.
    for (const f of LEDGER_FIXTURES.filter((x) => x.producers.includes("fail"))) {
      for (const a of HOLE_ABSENCES) {
        expect(
          f.declares as readonly string[],
          `${f.name} claims ${a} on a fail producer`,
        ).not.toContain(a);
      }
    }
  });

  it("some payload leaves the card quiet AND drawn", () => {
    const quiet = LEDGER_FIXTURES.filter((f) => f.declares.length === 0);
    expect(quiet.length, "no fixture exercises a ledger the card draws completely").toBeGreaterThan(0);
    for (const f of quiet) {
      cleanup();
      render(<SourceLedger component={f.component} />);
      for (const a of LEDGER_ABSENCES) expect(document.querySelector(`[${a}]`), f.name).toBeNull();
      expect(document.querySelector("[data-source-ledger]"), "quiet but nothing drawn").not.toBeNull();
    }
  });
});

describe("the ledger accounts for every source", () => {
  const ledger = (rows: unknown[], over: Record<string, unknown> = {}) => ({
    archetype: "SOURCE_LEDGER",
    rows,
    ...over,
  });

  it("keeps a row whose disposition it cannot read, and names it", () => {
    // THE PROPERTY THIS ARCHETYPE EXISTS FOR. Dropping the row shortens the ledger, and a
    // shorter ledger reads as a complete one — the silently-narrowed answer, arriving through
    // the renderer built to make it visible.
    render(
      <SourceLedger
        component={ledger([
          { row: "a", label: "A", disposition: "finding", verdict: "v", artifact: "h1" },
          { row: "b", label: "B", disposition: "from_a_newer_vocabulary", artifact: "h2" },
        ])}
      />,
    );
    expect(document.querySelectorAll("[data-ledger-row]")).toHaveLength(2);
    const unknown = document.querySelector("[data-ledger-unknown]")!;
    expect(unknown).not.toBeNull();
    expect(unknown.getAttribute("data-ledger-disposition")).toBe("from_a_newer_vocabulary");
  });

  it("does NOT guess an unknown disposition into a finding or a hole — the control", () => {
    render(
      <SourceLedger
        component={ledger([{ row: "b", label: "B", disposition: "deferred", artifact: "h2" }])}
      />,
    );
    expect(document.querySelector("[data-ledger-hole]")).toBeNull();
    expect(document.querySelector("[data-ledger-verdict]")).toBeNull();
  });

  it("drops ONLY a row that names no source — it cannot be accounted for", () => {
    render(
      <SourceLedger
        component={ledger([
          { label: "nameless", disposition: "finding", verdict: "v" },
          { row: "a", label: "A", disposition: "finding", verdict: "v", artifact: "h1" },
        ])}
      />,
    );
    expect(document.querySelectorAll("[data-ledger-row]")).toHaveLength(1);
  });

  it("refuses a ledger with NO rows — different from a ledger OF empty rows", () => {
    // A ledger accounting for nothing cannot support the one claim this archetype makes. Drawn
    // as a heading over a blank space it would read as "nothing was wrong".
    render(<SourceLedger component={ledger([])} />);
    expect(
      document.querySelector("[data-ledger-refused]")!.getAttribute("data-ledger-refused"),
    ).toBe("the ledger has no rows");
    expect(document.querySelector("[data-source-ledger]")).toBeNull();
  });

  it("renders the producer's prose — losing it would be a regression bought with an archetype", () => {
    render(
      <SourceLedger
        component={ledger(
          [{ row: "a", label: "A", disposition: "finding", verdict: "v", artifact: "h1" }],
          { summary: "Three measures, two reporting." },
        )}
      />,
    );
    expect(document.querySelector("[data-ledger-summary]")!.textContent).toContain("two reporting");
  });
});

describe("unsummarised is a finding, and empty keeps its evidence", () => {
  it("draws `unsummarised` as a finding row, NEVER a hole", () => {
    // R-073: the caller IS entitled and the verb DID run. A hole would tell a reader they lack
    // access they have, which is the one error here that cannot be taken back.
    render(
      <SourceLedger
        component={{
          archetype: "SOURCE_LEDGER",
          rows: [
            { row: "fin_variance", label: "variance", disposition: "unsummarised", artifact: "hop-7" },
          ],
        }}
      />,
    );
    expect(document.querySelector("[data-ledger-unsummarised]")).not.toBeNull();
    expect(document.querySelector("[data-ledger-hole]")).toBeNull();
    expect(screen.getByText(/no verdict emitted by fin_variance/i)).toBeTruthy();
  });

  it("keeps the evidence link on an `empty` row — it is how a reader CHECKS the claim", () => {
    // Nulling it would make "the verb answered and had nothing" unfalsifiable from the reader's
    // side. The disposition governs how loudly the card invites the click; the fact stays.
    render(
      <SourceLedger
        component={{
          archetype: "SOURCE_LEDGER",
          rows: [{ row: "fin_risk", label: "risk", disposition: "empty", artifact: "hop-9" }],
        }}
      />,
    );
    expect(document.querySelector("[data-ledger-empty]")).not.toBeNull();
    expect(
      document.querySelector("[data-ledger-artifact]")!.getAttribute("data-ledger-artifact"),
    ).toBe("hop-9");
    expect(document.querySelector("[data-ledger-no-artifact]")).toBeNull();
  });

  it("says a refused source has no evidence rather than drawing a blank", () => {
    render(
      <SourceLedger
        component={{
          archetype: "SOURCE_LEDGER",
          rows: [
            {
              row: "fin_cost",
              label: "cost",
              disposition: "unentitled",
              artifact: null,
              reason: "no grant",
            },
          ],
        }}
      />,
    );
    expect(document.querySelector("[data-ledger-no-artifact]")).not.toBeNull();
    expect(document.querySelector("[data-ledger-hole-reason]")!.textContent).toContain("no grant");
  });
});

describe("the contract reads the wire's own key names", () => {
  it("reads `row` as the source — the producer's name for it", () => {
    const r = validateSourceLedger({
      rows: [{ row: "fin_burn", label: "burn", disposition: "finding" }],
    });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.ledger.rows[0].source).toBe("fin_burn");
  });

  it("falls back to the source when no label was sent", () => {
    const r = validateSourceLedger({ rows: [{ row: "fin_burn", disposition: "finding" }] });
    if (r.kind !== "ok") throw new Error("expected ok");
    expect(r.ledger.rows[0].label).toBe("fin_burn");
  });
});
