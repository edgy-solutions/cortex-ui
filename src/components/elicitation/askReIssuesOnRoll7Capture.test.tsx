/**
 * LOT 3'S RE-ASK ON ROLL #7 — the real capture, and it is not the ask the dispatch expected.
 *
 * `sessions/2026-09-29-payload-cost-lot-3-refusal-roll-7.json` was fired by this lane against the
 * deployed fleet (helm revision 158, every deployment at `90fabab`) as the census asks it:
 * `alice`, COST_ANALYST, [PRODUCTION_COST], frontend `cortex-ui-desktop`, through the BFF's
 * `/orchestrate`. Nothing in it was written by hand.
 *
 * ── WHAT ROLL #7 SENT ──────────────────────────────────────────────────────────────────────
 * Both re-ask fields, for the first time on this row: `sub_query` is the question byte-for-byte
 * and `accepted_slots` is `{lot: 3}`. And NO MENU: `options: []`, `option_source: "none"`,
 * `free_text_reason: "no_referent"` for `rate_vintage`. The census row expects "TWO OPTION CHIPS
 * AND NO TEXT BOX" and calls an empty menu here the defect the OPTION_SOURCES re-key fixed — so
 * there is no PICK to walk on this fleet. What a reader can do is TYPE, and that is the path
 * sealed here, end to end, on the producer's own bytes.
 *
 * ── WHY `lot` IS NOT POSTED, AND WHY THAT IS RIGHT ─────────────────────────────────────────
 * `resolveAsk` computes `slots: {lot: 3}` for this RESPEAK and `dispatchReroute` does not send
 * it: a menu-less ask's slots go through `validate_bound_slots`, which refuses them as `no_menu`
 * by design (see `src/api/spokenAnswer.ts`). `lot 3` survives because the phrase it was read
 * from is re-issued BYTE-EQUAL — and that is asserted below rather than assumed.
 *
 * ⚠ THE SHAPE PRECONDITIONS ARE THE MEASUREMENT. When the producer restores the chips, the
 * "no menu" arm goes RED. That red is the news, not a broken test: move the pick arms of
 * `askReIssuesOnRealCapture.test.tsx` onto a fresh capture and retire this file's RESPEAK claim.
 */
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { AskCard } from "./AskCard";
import { dispatchReroute } from "./rerouteDispatch";
import { RESPEAK, validateAsk, type Reroute } from "./Elicitation.contract";
import type { SpokenAnswer } from "@/api/spokenAnswer";

afterEach(cleanup);

const CAPTURE = "2026-09-29-payload-cost-lot-3-refusal-roll-7.json";
const PHRASE = "did the rates move against the estimate on lot 3";

interface Capture {
  prompt: string;
  fleet_sha: string;
  asked_as: Record<string, unknown>;
  raw_events: { event?: string; data?: { components?: Record<string, unknown>[] } }[];
}
const capture = JSON.parse(
  readFileSync(path.join(__dirname, "../../../sessions", CAPTURE), "utf8"),
) as Capture;

/** The ask, found by SHAPE in the final payload the fleet streamed — never by event index. */
function theAsk(): Record<string, unknown> {
  const finals = capture.raw_events.filter((e) => e.event === "final_payload");
  expect(finals, "final_payload events").toHaveLength(1);
  const asks = (finals[0].data?.components ?? []).filter((c) => c.archetype === "ELICITATION");
  expect(asks, "ELICITATION components in the final payload").toHaveLength(1);
  return asks[0];
}

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

describe("the capture is roll #7's, and it carries both re-ask fields", () => {
  it("was asked as the census asks, of the fleet at 90fabab", () => {
    expect(capture.fleet_sha).toBe("90fabab");
    expect(capture.prompt).toBe(PHRASE);
    expect(capture.asked_as).toEqual({
      user: "alice", persona: "COST_ANALYST", domains: ["PRODUCTION_COST"], frontend_id: "cortex-ui-desktop",
    });
  });

  it("sub_query is the question byte-for-byte, and accepted_slots holds what the first turn got right", () => {
    const ask = theAsk();
    expect(ask.sub_query).toBe(PHRASE);
    expect(ask.accepted_slots).toEqual({ lot: 3 });
    expect(ask.slot).toBe("rate_vintage");
  });

  it("has NO MENU on this fleet — the measured regression against the census's two chips", () => {
    const ask = theAsk();
    expect(ask.options).toEqual([]);
    expect(ask.option_source).toBe("none");
    expect(ask.free_text_reason).toBe("no_referent");
  });

  it("validates as an ask this card can draw", () => {
    expect(validateAsk(theAsk()).kind).toBe("ok");
  });
});

describe("typing the rate vintage re-issues the question", () => {
  it("draws a text box and no option buttons, and says why there is no menu", () => {
    const c = render(<AskCard component={theAsk()} onReroute={() => {}} />).container;
    expect(c.querySelectorAll("[data-ask-option]")).toHaveLength(0);
    expect(c.querySelector("input")).not.toBeNull();
    expect(c.querySelector("[data-free-text-reason]")?.getAttribute("data-free-text-reason")).toBe("no_referent");
  });

  it("sends the phrase BYTE-EQUAL with the words beside it — lot 3 survives in the phrase", () => {
    const w = walk(theAsk());
    fireEvent.change(document.querySelector("input")!, { target: { value: "FY2024" } });
    fireEvent.submit(document.querySelector("form")!);

    expect(w.blocked).toEqual([undefined]);
    expect(w.routed[0].action).toBe(RESPEAK);
    expect(w.turns).toHaveLength(1);
    // Read off the RAW component, so no projection in between can launder it.
    expect(w.turns[0].query).toBe(String(theAsk().sub_query));
    expect(w.turns[0].query).toMatch(/lot 3/);
    expect(w.turns[0].query).not.toMatch(/FY2024|rate_vintage/);
    expect(w.turns[0].spoken).toEqual({ slot: "rate_vintage", answer: "FY2024" });
    // Not in bound_slots: a menu-less slot is refused there as `no_menu` by design.
    expect(w.turns[0].boundSlots).toBeUndefined();
  });

  it("resolveAsk still CARRIES accepted_slots on the reroute — dropped only at the wire, on purpose", () => {
    const w = walk(theAsk());
    fireEvent.change(document.querySelector("input")!, { target: { value: "FY2024" } });
    fireEvent.submit(document.querySelector("form")!);
    expect(w.routed[0].slots).toEqual({ lot: 3 });
  });
});

describe("what the cortex projected is what the fleet sent", () => {
  it("the recorded projection carries the same ask fields as the raw stream", () => {
    const raw = theAsk();
    const proj = (capture as unknown as { projected: { archetype: string; payload: Record<string, unknown> }[] })
      .projected.filter((p) => p.archetype === "ELICITATION");
    expect(proj).toHaveLength(1);
    for (const k of ["slot", "sub_query", "accepted_slots", "options", "option_source", "free_text_reason"]) {
      expect(proj[0].payload[k], k).toEqual(raw[k]);
    }
  });
});

describe("the EAC row that used to be the pick's capture no longer asks on roll #7", () => {
  const eac = JSON.parse(
    readFileSync(path.join(__dirname, "../../../sessions", "2026-09-29-payload-finance-eac-roll-7-no-longer-refuses.json"), "utf8"),
  ) as Capture;
  it("answers with COMPETING_MEASURES and carries no ELICITATION — so the 09-19 pick seal stays on its 09-19 capture", () => {
    expect(eac.fleet_sha).toBe("90fabab");
    const finals = eac.raw_events.filter((e) => e.event === "final_payload");
    expect(finals).toHaveLength(1);
    const kinds = (finals[0].data?.components ?? []).map((c) => c.archetype);
    expect(kinds).not.toContain("ELICITATION");
    expect(kinds).toContain("COMPETING_MEASURES");
  });
});
