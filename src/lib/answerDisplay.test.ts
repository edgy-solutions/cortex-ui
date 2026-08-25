/**
 * CHARACTERIZATION of the answer's DISPLAY facts — the eight derivations behind every
 * headline, glyph and group header an executive actually reads.
 *
 * One principle dominates this file: NEVER SYNTHESIZE. `summary` is a captured fact
 * composed once at the gateway write point; the read side returns it and nothing else.
 * When it is absent the module degrades to `question_text` — as a LABEL, not as an answer.
 * The distinction is invisible to a test that only checks "a non-empty string comes back":
 * a future `${subject} · ${verb}` composed here would satisfy that and would be the exact
 * synthesis-is-theater re-derivation the whole chain exists to prevent. So the fallback is
 * pinned by IDENTITY with question_text AND by the absence of routing facts in the result,
 * and `hasCapturedSummary` — the flag the row dims on — is asserted alongside every one of
 * them, because a headline that lies about its own provenance is worse than a missing one.
 *
 * The second theme is STRICTNESS as a feature. `isUnresolved` is `=== true`, not truthy;
 * `answerArchetype` matches a closed vocabulary and returns UNKNOWN rather than guessing.
 * Both are pinned in the negative direction too — the direction where a loosening slips in.
 *
 * The archetype sweep DERIVES its population from the union declared in the module source,
 * so a seventh archetype cannot inherit "tested" by being forgotten here. That derivation
 * carries a positive control: a regex that silently matched nothing would turn every
 * assertion below it into a pass over an empty list, which reads as coverage and is none.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";
import type { Artifact, RouteDecision } from "@/api/types";
import {
  answerSummary,
  hasCapturedSummary,
  answerArchetype,
  archetypeLabel,
  answerTopic,
  answerSearchText,
  isUnresolved,
  answerSPO,
  type AnswerArchetype,
} from "./answerDisplay";

const PRODUCED_FOR: Artifact["produced_for"] = {
  user_id: "alice",
  is_authenticated: true,
  entitlement_source: "none",
};

/** A grounded route: a resolved INSTANCE ("Customer 360") of a CLASS ("Dashboard"), and a
 *  verb. These three strings are the raw material a synthesizer would reach for, so the
 *  never-synthesize assertions below check for them by name. */
const ROUTING: RouteDecision = {
  about: {
    label: "Dashboard",
    uri: "urn:x:Dashboard",
    confidence: 0.9,
    instance_resolved: true,
    instance_identifier: "urn:x:dash:c360",
    instance_label: "Customer 360",
  },
  action: {
    label: "Look up ownership",
    iri: "mesh:lookupOwnership",
    confidence: 0.9,
    classify_called: true,
    candidate_count: 1,
  },
  handled_by: { engine_name: "Engine A", provider: "engine_a_lookup_ownership" },
};

const answer = (o: Partial<Artifact> = {}): Artifact => ({
  id: "a1",
  created_at: 1_000,
  updated_at: 1_000,
  valid_as_of: 1_000,
  valid_until: null,
  question_text: "who owns the alpha dashboard?",
  summary: "",
  resolved_intent: {},
  message_id: "msg-a1",
  status: "complete",
  rendered_output: null,
  produced_by: { actor_type: "agent", actor_id: "engine_a_lookup_ownership" },
  produced_for: PRODUCED_FOR,
  routing: null,
  sources: [],
  graph_trace: [],
  graph_trace_alternates: [],
  derived_from_artifact_id: null,
  durability_status: "durable",
  watermark: 1,
  ...o,
});

const withArchetype = (raw: string) =>
  answer({ rendered_output: { components: [], archetype: raw } });

/**
 * The archetype population, read from the declared union rather than hand-listed. A hand
 * list is a thing someone must remember to extend; the module's own type is not.
 */
const MODULE_SRC = readFileSync(path.join(__dirname, "answerDisplay.ts"), "utf8");
const DECLARED_ARCHETYPES = (() => {
  // Comments are STRIPPED before matching. The first version of this stopped at the first
  // semicolon in the file, and a prose semicolon inside a doc comment can sit before the
  // union's own — which is exactly what happened the day the union grew. A derivation that
  // punctuation can defeat is a guard that silently narrows its own population; the positive
  // control below is what turned that into a failure instead of a quiet six-member sweep.
  const src = MODULE_SRC.replace(/\/\/[^\n]*/g, "");
  const block = src.match(/export type AnswerArchetype\s*=([^;]*);/)?.[1] ?? "";
  return [...block.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1] as AnswerArchetype);
})();
const REAL_ARCHETYPES = DECLARED_ARCHETYPES.filter((t) => t !== "UNKNOWN");

describe("answerDisplay — the derived population", () => {
  it("the archetype derivation actually reads the union — positive control", () => {
    // Everything in the sweeps below iterates this list. A regex that matched nothing would
    // make each of them pass instantly over zero cases and report as coverage.
    expect(DECLARED_ARCHETYPES).toContain("CHART_WIDGET");
    expect(DECLARED_ARCHETYPES).toContain("UNKNOWN");
    expect(DECLARED_ARCHETYPES.length).toBeGreaterThanOrEqual(7);
    expect(REAL_ARCHETYPES.length).toBe(DECLARED_ARCHETYPES.length - 1);
  });
});

describe("answerSummary — the captured headline is read, never re-composed", () => {
  it("returns the captured summary VERBATIM even when routing could compose a prettier one", () => {
    // The seal. Everything needed to synthesize "Customer 360 · Look up ownership" is on
    // this artifact; the contract is that none of it is consulted. A read-side composer
    // would still return a plausible headline here, so plausibility is not the assertion —
    // byte identity with what the gateway captured is.
    const captured = "Customer 360 · owned by Data Platform (as of JUL 09)";
    const a = answer({ summary: captured, routing: ROUTING });

    expect(answerSummary(a)).toBe(captured);
    expect(hasCapturedSummary(a)).toBe(true);
  });

  it("an empty summary degrades to question_text EXACTLY — the question is a label, not an answer", () => {
    // The other half of the seal, and the one a synthesizer breaks. `toBeTruthy` or a
    // `toContain(question)` would both pass on "Customer 360 · Look up ownership"; identity
    // plus the explicit absence of every routing string is what refuses it.
    const a = answer({ summary: "", routing: ROUTING });

    expect(answerSummary(a)).toBe(a.question_text);
    expect(hasCapturedSummary(a)).toBe(false);
    expect(answerSummary(a)).not.toContain("Customer 360");
    expect(answerSummary(a)).not.toContain("Dashboard");
    expect(answerSummary(a)).not.toContain("Look up ownership");
    expect(answerSummary(a)).not.toContain("·");
  });

  it("a WHITESPACE-ONLY summary counts as absent in both directions", () => {
    // A projector that writes " " instead of "" must not produce a blank headline on the row
    // AND must not be reported as captured — the dim treatment is what tells the reader the
    // line is a question. The two functions have to agree on the emptiness test or the row
    // renders a fallback dressed as a captured fact.
    const a = answer({ summary: "   \n\t ", routing: ROUTING });

    expect(hasCapturedSummary(a)).toBe(false);
    expect(answerSummary(a)).toBe(a.question_text);
  });

  it("trims the captured headline — the only transformation applied to it", () => {
    // Pinned as found, and deliberately narrow: trim is whitespace-only and cannot change
    // meaning. Anything beyond it (case, truncation, punctuation) would be a rewrite.
    expect(answerSummary(answer({ summary: "  Customer 360 · owned by X  " }))).toBe(
      "Customer 360 · owned by X",
    );
  });

  it("falls to the SENTINEL when neither a headline nor a question survived", () => {
    // The exact string matters: it is the one place the module emits text of its own, and it
    // reads as an admission of absence rather than an answer. A row with a thin question is
    // a real shape — the pending seed writes summary: "" before anything else arrives.
    const a = answer({ summary: "", question_text: "  " });

    expect(answerSummary(a)).toBe("(untitled answer)");
    expect(hasCapturedSummary(a)).toBe(false);
  });

  it("hasCapturedSummary is TRUE only when answerSummary is returning the summary", () => {
    // The flag and the text are computed independently; drift between them is what makes the
    // row dim a real headline or brighten a question. Swept over every emptiness shape.
    const cases: Array<[Partial<Artifact>, boolean]> = [
      [{ summary: "real headline" }, true],
      [{ summary: " padded " }, true],
      [{ summary: "" }, false],
      [{ summary: "  " }, false],
      [{ summary: "0" }, true], // falsy-looking string, genuinely captured
    ];
    expect(cases.filter(([, captured]) => captured).length).toBeGreaterThan(0);
    expect(cases.filter(([, captured]) => !captured).length).toBeGreaterThan(0);

    for (const [patch, captured] of cases) {
      const a = answer(patch);
      expect(hasCapturedSummary(a), JSON.stringify(patch)).toBe(captured);
      expect(answerSummary(a) === (a.summary || "").trim(), JSON.stringify(patch)).toBe(captured);
    }
  });
});

describe("answerArchetype — deterministic classification of a closed vocabulary", () => {
  it("round-trips every declared archetype from rendered_output.archetype", () => {
    // Derived from the union, so a new BAML archetype that nobody wired into the matcher
    // fails here instead of silently rendering as the generic "Answer" glyph forever.
    expect(REAL_ARCHETYPES.length).toBeGreaterThanOrEqual(6);

    for (const t of REAL_ARCHETYPES) {
      expect(answerArchetype(withArchetype(t)), t).toBe(t);
    }
  });

  it("reads the FIRST component's archetype when the envelope has none", () => {
    // The real projection shape for single-component payloads: the archetype rides on the
    // component, not the envelope. Losing this branch turns every chart into "Answer".
    const a = answer({ rendered_output: { components: [{ archetype: "ROW_TABLE" }] } });

    expect(answerArchetype(a)).toBe("CHART_WIDGET");
  });

  it("prefers the ENVELOPE archetype over the first component's when both are present", () => {
    // Precedence pinned because it is invisible until the two disagree, and then it decides
    // the glyph. The envelope is the projector's considered answer; the component is a hint.
    const a = answer({
      rendered_output: { archetype: "KNOWLEDGE_DOCUMENT", components: [{ archetype: "SCATTER" }] },
    });

    expect(answerArchetype(a)).toBe("KNOWLEDGE_DOCUMENT");
  });

  it("collapses every chart/table sub-variant onto the CHART_WIDGET family", () => {
    // The glyph vocabulary is deliberately smaller than the renderer's. A new sub-variant
    // that stops collapsing gets the "Answer" glyph and, worse, its own TYPE band on the
    // canvas — splitting one family across two rows of the map.
    for (const raw of ["CHART_WIDGET", "CHART", "BAR_CHART", "LINE_CHART", "TABLE", "ROW_TABLE", "SCATTER"]) {
      expect(answerArchetype(withArchetype(raw)), raw).toBe("CHART_WIDGET");
    }
  });

  it("collapses the legacy METRIC alias onto ASSET_STATE_METRIC", () => {
    // A second spelling from an older projector. Same family, same band.
    expect(answerArchetype(withArchetype("METRIC"))).toBe("ASSET_STATE_METRIC");
  });

  it("is case-INSENSITIVE — a lowercase payload classifies identically", () => {
    // Payload casing is not a contract anyone enforces upstream; the matcher uppercases
    // first. Dropping that turns a whole projector's output into UNKNOWN at once.
    expect(answerArchetype(withArchetype("knowledge_document"))).toBe("KNOWLEDGE_DOCUMENT");
    expect(answerArchetype(withArchetype("bar_chart"))).toBe("CHART_WIDGET");
  });

  it("returns UNKNOWN — never a guess — for every absent or malformed shape", () => {
    // The no-synthesis rule applied to type. Each of these is a real row shape: pending
    // (null output), thin (no archetype anywhere), non-object components (a string payload),
    // and an archetype the vocabulary does not contain. Guessing here mislabels the TYPE
    // band, which is a claim about what the answer IS.
    const malformed: Array<[string, Artifact]> = [
      ["pending row, null rendered_output", answer({ rendered_output: null })],
      ["no archetype anywhere", answer({ rendered_output: { components: [{ data: 1 }] } })],
      ["empty components", answer({ rendered_output: { components: [] } })],
      ["component is a string", answer({ rendered_output: { components: ["TABLE"] } })],
      ["component is null", answer({ rendered_output: { components: [null] } })],
      ["archetype is empty string", withArchetype("")],
      ["archetype is a number", answer({ rendered_output: { components: [], archetype: 7 as unknown as string } })],
      ["unknown vocabulary word", withArchetype("SANKEY_DIAGRAM")],
    ];
    expect(malformed.length).toBeGreaterThanOrEqual(8);

    for (const [why, a] of malformed) {
      expect(answerArchetype(a), why).toBe("UNKNOWN");
    }
  });

  it("ignores an archetype carried by a LATER component — only components[0] is consulted", () => {
    // Characterized as found. A multi-component payload whose first block is untyped reports
    // UNKNOWN even though the answer plainly is a chart. Harmless for today's single-block
    // payloads; it is the shape that would silently mis-band a composite dashboard.
    const a = answer({ rendered_output: { components: [{ data: 1 }, { archetype: "CHART" }] } });

    expect(answerArchetype(a)).toBe("UNKNOWN");
  });

  it("does NOT trim the raw archetype — a padded value falls out of the vocabulary", () => {
    // Characterized as found, not endorsed. `summary` is trimmed, this is not, so a
    // projector emitting " CHART_WIDGET " loses its glyph. Recorded so the asymmetry is a
    // decision someone can review rather than a surprise.
    expect(answerArchetype(withArchetype(" CHART_WIDGET "))).toBe("UNKNOWN");
  });

  it("classification does not consult the FALLBACK flag — type and resolution are orthogonal", () => {
    // ADR-0028: fallback is an overlay that rides on any archetype, not an archetype. If the
    // two ever merged, a fallback answer would lose its real type on the canvas and in the
    // TYPE band header.
    const a = answer({
      rendered_output: { components: [], archetype: "KNOWLEDGE_DOCUMENT" },
      routing: { ...ROUTING, fallback: true },
    });

    expect(isUnresolved(a)).toBe(true);
    expect(answerArchetype(a)).toBe("KNOWLEDGE_DOCUMENT");
  });
});

describe("archetypeLabel — the TYPE band header and a11y name", () => {
  it("gives EVERY real archetype its own non-generic label", () => {
    // Two archetypes sharing a label makes two canvas bands indistinguishable by their
    // headers, and "Answer" is the I-don't-know label — a real type must never wear it.
    expect(REAL_ARCHETYPES.length).toBeGreaterThanOrEqual(6);

    const labels = REAL_ARCHETYPES.map((t) => archetypeLabel(t));
    for (const [i, t] of REAL_ARCHETYPES.entries()) {
      expect(labels[i], t).not.toBe("Answer");
      expect(labels[i].length, t).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(REAL_ARCHETYPES.length);
  });

  it("labels UNKNOWN as the honest generic 'Answer'", () => {
    // The one place a generic word is correct: nothing was captured, so nothing is claimed.
    expect(archetypeLabel("UNKNOWN")).toBe("Answer");
  });

  it("an unrecognised value takes the same generic branch as UNKNOWN", () => {
    // Runtime input can outrun the union (a projector shipping ahead of the UI). The default
    // arm keeps the header rendering instead of showing `undefined`.
    expect(archetypeLabel("SANKEY" as AnswerArchetype)).toBe("Answer");
  });
});

describe("isUnresolved — the dead-end discriminator, strictly", () => {
  it("is TRUE only for an explicit routing.fallback === true", () => {
    expect(isUnresolved(answer({ routing: { ...ROUTING, fallback: true } }))).toBe(true);
  });

  it("is FALSE for every shape of absence — a missing flag is not a dead end", () => {
    // The collapse treatment hides a group behind a count. Reading absence as "unresolved"
    // would sweep good answers into that collapsed group; reading it as resolved (what the
    // code does) leaves them where the user expects them.
    const absences: Array<[string, Artifact]> = [
      ["no routing at all (pending row)", answer({ routing: null })],
      ["routing present, flag absent", answer({ routing: ROUTING })],
      ["flag explicitly false", answer({ routing: { ...ROUTING, fallback: false } })],
    ];
    expect(absences.length).toBeGreaterThanOrEqual(3);

    for (const [why, a] of absences) expect(isUnresolved(a), why).toBe(false);
  });

  it("rejects a TRUTHY non-boolean — the check is === true, not a coercion", () => {
    // A JSON round-trip that turns the flag into the string "true" (or 1) must not silently
    // start collapsing answers. Strictness here is what makes the flag's provenance legible:
    // only a real boolean from the supervisor counts.
    const stringy = answer({ routing: { ...ROUTING, fallback: "true" as unknown as boolean } });
    const numeric = answer({ routing: { ...ROUTING, fallback: 1 as unknown as boolean } });

    expect(isUnresolved(stringy)).toBe(false);
    expect(isUnresolved(numeric)).toBe(false);
  });
});

describe("answerTopic — the TOPIC grouping key", () => {
  it("is the subject CLASS label for a grounded answer", () => {
    // The class, not the instance: grouping by instance would give a block per answer.
    expect(answerTopic(answer({ routing: ROUTING }))).toBe("Dashboard");
  });

  it("UNRESOLVED wins over a grounded label — the collapse rule dominates the topic", () => {
    // A fallback answer can still carry an `about` from the resolver that ran before routing
    // gave up. Grouping it by that label would scatter dead-ends through the real topics
    // instead of collecting them in the one collapsed group the user can expand at will.
    const a = answer({ routing: { ...ROUTING, fallback: true } });

    expect(a.routing?.about?.label).toBe("Dashboard");
    expect(answerTopic(a)).toBe("unresolved");
  });

  it("falls to 'ungrouped' for every missing-label shape — never an empty group name", () => {
    // An empty key would render a headerless block on the canvas and an unnamed cluster in
    // the list. The two sentinels are distinct on purpose: "ungrouped" means no subject was
    // captured, "unresolved" means routing declared a dead end.
    for (const [why, a] of [
      ["no routing", answer({ routing: null })],
      ["no about", answer({ routing: { ...ROUTING, about: undefined as never } })],
      ["blank label", answer({ routing: { ...ROUTING, about: { ...ROUTING.about, label: "   " } } })],
    ] as Array<[string, Artifact]>) {
      expect(answerTopic(a), why).toBe("ungrouped");
    }
  });

  it("trims the label so ' Dashboard ' and 'Dashboard' are ONE topic, not two", () => {
    // Untrimmed keys split a topic into near-identical blocks that look like a rendering bug.
    const padded = answer({ routing: { ...ROUTING, about: { ...ROUTING.about, label: " Dashboard " } } });

    expect(answerTopic(padded)).toBe(answerTopic(answer({ routing: ROUTING })));
  });
});

describe("answerSearchText — search reaches INSIDE the answer", () => {
  it("matches a value buried in the rendered payload, not just the headline", () => {
    // The reason this function exists: an executive searching an email address expects the
    // answer whose TABLE contains it, and that string appears nowhere in summary, question
    // or topic. Losing the JSON.stringify silently narrows search to headlines.
    const a = answer({
      summary: "Ownership of Customer 360",
      rendered_output: { components: [{ rows: [{ owner: "Bob@Example.com" }] }] },
    });

    expect(answerSearchText(a)).toContain("bob@example.com");
  });

  it("is entirely lowercased — the caller compares against a lowercased query", () => {
    // The casefold lives here, once. A caller doing its own toLowerCase on the query while
    // this returned mixed case would make every capitalised term unsearchable.
    const text = answerSearchText(answer({ summary: "Customer 360 · Owned By Data Platform" }));

    expect(text).toBe(text.toLowerCase());
    expect(text).toContain("owned by data platform");
  });

  it("includes the headline, the question and the topic together", () => {
    // Three different things a user might remember about the same answer. All three are
    // searchable, so recall does not depend on which one they type.
    const text = answerSearchText(
      answer({ summary: "Ownership resolved", question_text: "who owns alpha?", routing: ROUTING }),
    );

    expect(text).toContain("ownership resolved");
    expect(text).toContain("who owns alpha?");
    expect(text).toContain("dashboard");
  });

  it("includes each source's label, snippet and uri", () => {
    // Citations are how people re-find an answer ("the one that cited the runbook"). Sources
    // are stringified field-by-field rather than wholesale, so a new Source field is NOT
    // searchable until someone adds it here — worth knowing before filing a search bug.
    const text = answerSearchText(
      answer({
        sources: [
          {
            type: "document",
            label: "Runbook Alpha",
            uri: "s3://bucket/runbook-alpha.pdf",
            snippet: "Escalate to the Data Platform rota",
          },
        ],
      }),
    );

    expect(text).toContain("runbook alpha");
    expect(text).toContain("s3://bucket/runbook-alpha.pdf");
    expect(text).toContain("escalate to the data platform rota");
  });

  it("survives a NON-SERIALIZABLE payload instead of throwing into the list render", () => {
    // A circular component (a payload carrying a back-reference) would make JSON.stringify
    // throw. This function runs inside the answers list's memo, so an uncaught throw here is
    // a blank sidebar, not a missed match. The headline still has to come back.
    const circular: Record<string, unknown> = { name: "loop" };
    circular.self = circular;
    const a = answer({ summary: "Still findable", rendered_output: { components: [circular] } });

    expect(() => answerSearchText(a)).not.toThrow();
    expect(answerSearchText(a)).toContain("still findable");
  });

  it("leaks the '(untitled answer)' SENTINEL into the searchable text", () => {
    // Characterized as found, not endorsed. answerSearchText builds on answerSummary, so a
    // row with neither headline nor question is matched by the query "untitled" — a word no
    // user typed into the system. Harmless today; it is why search results can include rows
    // that show no visible match.
    const text = answerSearchText(answer({ summary: "", question_text: "" }));

    expect(text).toContain("(untitled answer)");
  });
});

describe("answerSPO — the provenance the card carries forward", () => {
  it("shows the resolved INSTANCE while KEEPING the class beside it", () => {
    // ADR-0028 Decision 2: the eye hunts "Customer 360", but v2/v3 eligibility computes over
    // the CLASS. Overwriting subjectClassLabel with the instance would lose the type with no
    // way to re-derive it, which is exactly the capture-or-lose-forever failure.
    const spo = answerSPO(answer({ routing: ROUTING }));

    expect(spo.subjectLabel).toBe("Customer 360");
    expect(spo.subjectClassLabel).toBe("Dashboard");
    expect(spo.subjectUri).toBe("urn:x:Dashboard");
    expect(spo.verbLabel).toBe("Look up ownership");
    expect(spo.verbIri).toBe("mesh:lookupOwnership");
  });

  it("falls back to the CLASS as the display subject for a set-level query", () => {
    // "How many dashboards are there" resolves no instance. The card still needs a subject,
    // and the class is the honest one — both fields then agree by construction.
    const spo = answerSPO(
      answer({ routing: { ...ROUTING, about: { ...ROUTING.about, instance_label: undefined } } }),
    );

    expect(spo.subjectLabel).toBe("Dashboard");
    expect(spo.subjectClassLabel).toBe("Dashboard");
  });

  it("returns NULLs — never empty strings — for every absence", () => {
    // The card branches on null to hide a chip. An empty string is truthy-adjacent enough
    // that a `!= null` check would render an empty chip; blank-but-present labels are
    // normalised to null here so the absent case has exactly one shape.
    const missing = answerSPO(answer({ routing: null }));
    expect(missing).toEqual({
      subjectLabel: null,
      subjectClassLabel: null,
      subjectUri: null,
      verbLabel: null,
      verbIri: null,
    });

    const blank = answerSPO(
      answer({
        routing: {
          ...ROUTING,
          about: { ...ROUTING.about, label: "  ", instance_label: " ", uri: "" },
          action: { ...ROUTING.action, label: "   ", iri: "" },
        },
      }),
    );
    expect(blank).toEqual({
      subjectLabel: null,
      subjectClassLabel: null,
      subjectUri: null,
      verbLabel: null,
      verbIri: null,
    });
  });

  it("does NOT trim the URIs, only the labels", () => {
    // Characterized as found. Labels are display text and get trimmed; the URIs are identity
    // and are passed through untouched, so a padded uri stays padded and will not match an
    // equality comparison against the same uri from another row.
    const spo = answerSPO(
      answer({
        routing: {
          ...ROUTING,
          about: { ...ROUTING.about, uri: " urn:x:Dashboard " },
          action: { ...ROUTING.action, iri: " mesh:lookupOwnership " },
        },
      }),
    );

    expect(spo.subjectUri).toBe(" urn:x:Dashboard ");
    expect(spo.verbIri).toBe(" mesh:lookupOwnership ");
  });

  it("carries provenance even for an UNRESOLVED answer — the topic collapses, the facts do not", () => {
    // answerTopic sends this row to the collapsed group; answerSPO must still report what the
    // resolver saw, because "why did this dead-end" is answered by exactly those fields.
    const a = answer({ routing: { ...ROUTING, fallback: true } });

    expect(answerTopic(a)).toBe("unresolved");
    expect(answerSPO(a).subjectLabel).toBe("Customer 360");
    expect(answerSPO(a).verbLabel).toBe("Look up ownership");
  });
});
