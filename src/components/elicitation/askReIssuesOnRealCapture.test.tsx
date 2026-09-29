/**
 * LOT 3'S RE-ASK, END TO END, ON A REAL PRODUCER CAPTURE — not on a card this lane invented.
 *
 * Every other seal on this path builds its ask from a literal: `AskCard.test.tsx` from a hand-
 * written fixture, `AskCard.corpus.test.tsx` from the documented elicitation corpus. Both are
 * honest about their provenance and neither can catch the producer changing shape, because the
 * bytes they assert against are bytes this repo wrote.
 *
 * This one opens `sessions/2026-09-19-payload-finance-eac-refusal.json` — the post-projector
 * payload captured through the census runner's own fire path, at fleet `c0005142` — and walks
 * the menu it actually contains through the real component to the real send seam.
 *
 * ⛔ THE CAPTURE IS IN THE GLOB'S REACH, AND THAT IS LOAD-BEARING. `sessions/*payload*.json` is
 * what the corpus instruments sweep, and this lane has already paid for a capture delivered as
 * `.md`: it was invisible to the glob, so a seal that had never observed its subject stayed
 * GREEN on the day it became false. A future capture dropped into that directory is swept by
 * the census arm below without anybody wiring it up.
 *
 * ⚠ AND THE PRECONDITIONS ARE ASSERTED, NOT SKIPPED. There is no `skipIf` here. If the capture
 * stops carrying `sub_query`, or `accepted_slots`, or its options, this file goes RED rather
 * than quietly reporting nothing — which is the difference between a seal and a hollow green.
 * An arm gated on its subject's presence cannot report that the subject went away.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { AskCard } from "./AskCard";
import { dispatchReroute } from "./rerouteDispatch";
import { BIND, validateAsk, type Reroute } from "./Elicitation.contract";
import type { SpokenAnswer } from "@/api/spokenAnswer";

afterEach(cleanup);

const SESSIONS = path.join(__dirname, "../../../sessions");
const CAPTURE = "2026-09-19-payload-finance-eac-refusal.json";

interface Capture {
  projected: { payload: Record<string, unknown> }[];
  raw_events: { data?: { components?: Record<string, unknown>[] } }[];
  fleet_sha?: string;
}

const capture = JSON.parse(readFileSync(path.join(SESSIONS, CAPTURE), "utf8")) as Capture;

/**
 * The menu as the PRODUCER emitted it, found by SHAPE and never by index.
 *
 * `raw_events[13]` is where it sits in this file today. Reaching for that number would make the
 * seal a claim about one capture's event ordering — so an ask that moved by one event would
 * report "no menu" and the arms below would assert against `undefined`.
 */
function rawMenu(c: Capture): Record<string, unknown> {
  const all = (c.raw_events ?? []).flatMap((e) => e.data?.components ?? []);
  const menus = all.filter(
    (comp) =>
      comp.archetype === "ELICITATION" && Array.isArray(comp.options) && comp.options.length > 0,
  );
  // Exactly one, by cardinality. "At least one" would let a second menu appear unnoticed and
  // silently pick the first, which is how a seal starts measuring a different subject.
  expect(menus, `option-bearing ELICITATION components in ${CAPTURE}`).toHaveLength(1);
  return menus[0];
}

const RAW = rawMenu(capture);
/** What the SCREEN was handed — a different producer from `raw_events`, so comparing them is a claim. */
const PROJECTED = capture.projected[0].payload;

/** Watch both seams, wired the way `AskCardConnected` wires them. */
function walk(component: Record<string, unknown>) {
  const turns: { query: string; boundSlots?: Record<string, string>; spoken?: SpokenAnswer }[] = [];
  const routed: Reroute[] = [];
  const blocked: (string | undefined)[] = [];
  render(
    <AskCard
      component={component}
      onReroute={(reroute, ask) => {
        routed.push(reroute);
        blocked.push(
          dispatchReroute(reroute, ask, (query, boundSlots, spoken) => {
            turns.push({ query, boundSlots, spoken });
          }).blocked,
        );
      }}
    />,
  );
  return { turns, routed, blocked };
}

describe("the capture carries what the re-ask needs, or this file is measuring nothing", () => {
  it("is the ask the walk-sheet really produced, with both re-ask fields present", () => {
    expect(RAW.archetype).toBe("ELICITATION");
    expect(RAW.slot).toBe("method");
    // Non-empty, not merely present. A `sub_query: ""` passes every containment check and then
    // takes `dispatchReroute`'s NO_PHRASE branch, so the end-to-end arms below would be
    // measuring the refusal path while claiming to measure the re-ask.
    expect(String(RAW.sub_query ?? ""), "the phrase the menu belongs to").not.toBe("");
    // And the accepted set must be a RECORD WITH SOMETHING IN IT, because an empty one cannot
    // show that a prior turn's slot survives the re-route — the whole claim of this file.
    expect(RAW.accepted_slots, "slots the first turn already got right").toEqual({
      program_id: "NP-MERIDIAN",
    });
  });

  it("was captured through the projector, and the projector did not drop the re-ask fields", () => {
    /*
      THE TWO SIDES HERE ARE DIFFERENT PRODUCERS, which is what makes this an assertion rather
      than a tautology. `raw_events` is the SSE the fleet emitted; `projected` is what the
      census runner handed the screen. A field can be row-level-present and envelope-level
      dropped, and this lane has filed exactly that shape before — so comparing them names
      WHOSE bug a missing field would be.
    */
    for (const field of ["sub_query", "slot", "option_source", "accepted_slots"]) {
      expect(PROJECTED[field], `projected.${field} against the raw component`).toEqual(RAW[field]);
    }
    expect(PROJECTED.options).toEqual(RAW.options);
  });

  it("is a DECLARATION-born menu, which is the half of the population that carries both fields", () => {
    /*
      ⛔ THIS ARM EXISTS TO STOP THIS FILE BEING READ AS MORE THAN IT IS.

      `option_source` says which producer built the menu, and the three values do NOT carry the
      same fields (measured at the producer, `agent_fleet/presentation_agent/main.py`):

        declaration   the envelope path, slot_disposition.py:634  -> sub_query AND accepted_slots
        refusal       _render_refusal_menu  -> sub_query via the wrapper, accepted_slots ABSENT
        candidates    _render_abstain_menu  -> the same gap, for the same reason

      `_reroute_fields` omits `accepted_slots` deliberately when the wrapper does not carry it,
      and the wrapper does not: gateway.py's `_results` and dynamic_supervisor.py's POST body
      both send `sub_query` and not the accepted set. So this capture proves the re-ask works on
      the declaration-born third of the population and says NOTHING about the other two.

      ⚠ AND THE CENSUS BELOW CONTRADICTED THIS FILE'S FIRST DRAFT, WHICH IS WHY IT IS HERE. That
      draft asserted "there is no capture of a refusal-born or abstain-born menu in `sessions/`".
      The census went RED on its first run and named one: `performance-indices.json` carries a
      live `candidates` menu with SEVEN options and neither re-ask field. The claim had been
      written from the one capture I had opened, which is a claim about what I read and not about
      the corpus — so the abstain-born half is walked end to end below rather than described.
    */
    expect(RAW.option_source).toBe("declaration");
  });
});

describe("the pick re-issues the question with the slot filled — every option, not one", () => {
  // Narrowed with a THROW rather than `!` or a cast: if the real capture ever stops validating as
  // an ask, every arm below is measuring a card that was never built, and a cast would let them
  // report that as green. The throw names the kind, so the red carries its own reason.
  const validated = validateAsk(RAW);
  if (validated.kind !== "ok") {
    throw new Error(
      `the capture must validate as an ask for these arms to mean anything, got kind="${validated.kind}"`,
    );
  }
  const ask = validated.ask;
  const options = ask.options;

  it("offers exactly the options the producer sent, as buttons", () => {
    walk(RAW);
    const drawn = Array.from(document.querySelectorAll("[data-ask-option]")).map((b) =>
      b.getAttribute("data-ask-option"),
    );
    // Equality, not containment: containment cannot see an option that went missing or one that
    // crept in, and both are producer-contract failures this card would otherwise render past.
    expect(drawn).toEqual(options.map((o) => o.value));
    expect(options.length).toBeGreaterThan(1);
  });

  /*
    THE POPULATION IS THE CAPTURE'S OPTIONS, NOT A PICK THIS TEST CHOSE. Three hand-written arms
    would have been three claims about CPI, CPI_SPI and REMAINING_AT_BUDGET; this is one claim
    about every option the producer offered, and it grows if the producer offers a fourth.
  */
  for (const opt of options) {
    it(`picking ${opt.value} re-issues the phrase byte-equal and binds program_id beside it`, () => {
      const w = walk(RAW);
      fireEvent.click(document.querySelector(`[data-ask-option="${opt.value}"]`)!);

      expect(w.blocked).toEqual([undefined]); // it went; nothing was refused
      expect(w.routed[0].action).toBe(BIND);
      expect(w.turns).toHaveLength(1);

      // ── THE PHRASE, BYTE-EQUAL TO THE CAPTURE'S OWN BYTES ──────────────────────────────
      // Read off the RAW component, not off `ask`, so the projection cannot launder it. A
      // composed phrase — `"<sub_query> (<slot>: CPI)"` — is the defect this path closed, and
      // it reached the rail and was displayed as something a person said.
      expect(w.turns[0].query).toBe(String(RAW.sub_query));
      expect(w.turns[0].query).not.toMatch(new RegExp(opt.value));
      expect(w.turns[0].query).not.toMatch(/method/);

      // ── AND THE SLOT THE FIRST TURN GOT RIGHT SURVIVES ─────────────────────────────────
      // Exact equality on the whole record. Containment would pass while `program_id` was
      // dropped, which is precisely the failure the producer's `accepted_slots` exists to
      // prevent: "a re-route pre-binding ONLY the answered slot would suppress filling of
      // every other slot the first turn already got right".
      expect(w.turns[0].boundSlots).toEqual({
        program_id: "NP-MERIDIAN",
        method: opt.value,
      });

      /*
        ⛔ "NO LABEL REACHES THE WIRE" IS NOT TESTABLE ON THIS CAPTURE, AND SAYING SO IS THE
        POINT. Every option the producer sent here has `label === value` — `{"label":"CPI",
        "value":"CPI"}` — so an implementation that posted the label instead of the value would
        produce byte-identical output and this arm would pass. The first draft asserted it anyway
        and went RED for the honest reason: `not.toContain("CPI")` on a record that legitimately
        contains `"CPI"`.

        A defect hidden because two values coincide is only catchable on an input where they
        diverge. That input does not exist in any real capture in `sessions/` — so the claim is
        carried by `rerouteDispatch.test.ts`, where the fixture is `{value: "C1", label: "Data
        Governance"}` and the divergence is real. If a capture with distinguishable labels ever
        lands, this is the arm to strengthen.
      */
      expect(
        options.every((o) => o.label === o.value),
        "label/value coincide throughout this capture, which is why the wire-label claim lives elsewhere",
      ).toBe(true);
      // A BIND carries no spoken words — those are the other arm's payload, and the server
      // merges them into `spoken` and re-runs the ladder.
      expect(w.turns[0].spoken).toBeUndefined();
    });
  }
});

describe("the ABSTAIN-born menu, walked on its own real capture — it dead-ends, visibly", () => {
  /*
    THE OTHER HALF OF THE POPULATION, AND IT IS NOT HYPOTHETICAL.

    `sessions/2026-09-19-payload-finance-performance-indices.json` carries what
    `_render_abstain_menu` emitted at fleet `c0005142`: seven capability IRIs as options, and a
    component whose keys are EXACTLY

        archetype, message, option_source, options, reason, slot, source_persona

    — no `sub_query`, no `accepted_slots`. A reader is shown seven things they may click and
    every click dead-ends, because a BIND re-issues `sub_query` as the whole phrase and there is
    no phrase.

    ⚠ WHAT IS ASSERTED HERE IS CORTEX'S HALF: that the dead end is REPORTED rather than silent.
    The producer has since closed its half — `_render_refusal_menu` and `_render_abstain_menu`
    both spread `**_reroute_fields(raw_data)` at cortex's pinned `PRODUCER_REF` (`ec055c49`), not
    merely on somebody's disk, which was checked with `git show <pin>:…` before this was written.
    So a menu captured TODAY would carry `sub_query`. `accepted_slots` still would not: that is
    blocked in the supervisor WRAPPER, not in the renderers, and it is the platform's to close.

    This capture is therefore a witness to the old shape, kept and walked, because the old shape
    is what a re-capture has to differ from.
  */
  const ABSTAIN_CAPTURE = "2026-09-19-payload-finance-performance-indices.json";
  const abstain = JSON.parse(
    readFileSync(path.join(SESSIONS, ABSTAIN_CAPTURE), "utf8"),
  ) as Capture;
  const RAW_ABSTAIN = rawMenu(abstain);

  it("is the abstain menu the producer really emitted, carrying NEITHER re-ask field", () => {
    expect(RAW_ABSTAIN.option_source).toBe("candidates");
    expect(RAW_ABSTAIN.slot).toBe("verb");
    // `in`, not a truthiness check. A key present with an `undefined` value passes every
    // containment test while the consumer takes its absent-value fallback, so the claim has to
    // be about the KEY.
    expect("sub_query" in RAW_ABSTAIN, "sub_query on an abstain-born menu").toBe(false);
    expect("accepted_slots" in RAW_ABSTAIN, "accepted_slots on an abstain-born menu").toBe(false);
    expect((RAW_ABSTAIN.options as unknown[]).length).toBe(7);
  });

  it("refuses the pick IN WORDS instead of sending an empty turn, for every option offered", () => {
    const opts = (RAW_ABSTAIN.options as { value: string; label: string }[]).map((o) => o.value);
    expect(opts.length).toBe(7); // the population, tied — not a pick this test chose
    for (const value of opts) {
      const w = walk(RAW_ABSTAIN);
      fireEvent.click(document.querySelector(`[data-ask-option="${value}"]`)!);

      // The card DID resolve the pick — the refusal is at the send seam, not at the menu.
      expect(w.routed[0].action).toBe(BIND);
      // ⛔ AND NOTHING WENT. A blocked turn that also sent would be the worst of both.
      expect(w.turns, `turns sent for ${value}`).toEqual([]);
      expect(w.blocked[0], `what the reader is told about ${value}`).toMatch(
        /arrived without the question it came from/,
      );
      cleanup();
    }
  });
});

describe("the capture corpus is swept, so a new menu capture cannot arrive unmeasured", () => {
  it("names every option-bearing ELICITATION in sessions/*payload*.json and the fields it carries", () => {
    /*
      ⛔ THE CENSUS IS THE POINT, AND IT HAS ALREADY EARNED ITS KEEP. On its first run it named a
      capture this file's own header had claimed did not exist. What it reports is a LEDGER of
      every option-bearing ask in the corpus and which of the two re-ask fields each carries — so
      a new capture is a change this arm reports rather than one it absorbs, in either direction:
      a menu that arrives still dead-ended reddens, and so does one that arrives FIXED, which is
      the signal that the wrapper gap has been closed upstream.

      A null from this readdir would be a claim about the filter, not about the repo, so the count
      is asserted before anything is concluded from it.
    */
    const files = readdirSync(SESSIONS).filter((f) => f.includes("payload") && f.endsWith(".json"));
    expect(files.length, "capture files the glob reaches").toBeGreaterThanOrEqual(10);
    expect(files, "the capture this file walks").toContain(CAPTURE);

    const menus: { file: string; source: unknown; hasPhrase: boolean; hasAccepted: boolean }[] = [];
    for (const f of files) {
      const j = JSON.parse(readFileSync(path.join(SESSIONS, f), "utf8")) as Capture;
      for (const comp of (j.raw_events ?? []).flatMap((e) => e.data?.components ?? [])) {
        if (comp.archetype !== "ELICITATION") continue;
        if (!Array.isArray(comp.options) || comp.options.length === 0) continue;
        menus.push({
          file: f,
          source: comp.option_source,
          hasPhrase: String(comp.sub_query ?? "") !== "",
          hasAccepted: comp.accepted_slots !== null && typeof comp.accepted_slots === "object",
        });
      }
    }

    /*
      THE LEDGER, PINNED AS A WHOLE RATHER THAN AS TWO SEPARATE COUNTS. One string per menu,
      carrying the origin and both fields, because "two menus" and "both fields present somewhere"
      are the two claims a pair of counts would let through.

      Read it as the state of the wire on the day each capture was taken — NOT as what the
      producer emits today. `ec055c49` spreads the re-ask fields into both menu renderers, so a
      re-capture of the `candidates` row should arrive with `phrase` and would redden this arm.
      That red is the good news, and the row's `-accepted` half will still be the wrapper gap.
    */
    expect(
      menus.map(
        (m) =>
          `${m.file} [${m.source}] ${m.hasPhrase ? "phrase" : "-phrase"} ${m.hasAccepted ? "accepted" : "-accepted"}`,
      ),
    ).toEqual([
      `${CAPTURE} [declaration] phrase accepted`,
      "2026-09-19-payload-finance-performance-indices.json [candidates] -phrase -accepted",
    ]);
    // AND THE DECLARATION-BORN ROWS MUST BE COMPLETE, WITH NO EXCEPTIONS LISTED BY NAME. This is
    // the arm that would catch the envelope path regressing, and it is keyed on the ORIGIN rather
    // than on a file name — so a new declaration-born capture is in the population by default
    // instead of having to be added to something.
    const declBroken = menus
      .filter((m) => m.source === "declaration" && !(m.hasPhrase && m.hasAccepted))
      .map((m) => m.file);
    expect(
      declBroken,
      "declaration-born menus missing a re-ask field — the envelope path has no excuse for this",
    ).toEqual([]);
  });
});
