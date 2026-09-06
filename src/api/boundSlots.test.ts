/**
 * THE JOIN, SEALED FROM THIS SIDE — and honest about which half this side can reach.
 *
 * The failure being guarded is SILENT. `gateway.py` reads `request.bound_slots`; a body posting
 * `slots` is not rejected, because the model simply parses the field it wants as None. The
 * supervisor then sees no pick and the turn proceeds AS IF THE READER HAD NOT ANSWERED — a
 * wrong answer, no 422, no log line, nothing anywhere saying so. `slots` is not a hypothetical
 * mistake either: it is the name the producer's own `Reroute` uses, and the name this codebase
 * carries right up to the rename.
 *
 * WHAT THIS FILE CANNOT DO. A vitest process cannot POST to a gateway and read what pydantic
 * parsed, so the far half of the join — "the body cortex sends populates `request.bound_slots`"
 * — belongs to a backend test and is named as an ask rather than faked here. What this file
 * does instead is read THE GATEWAY'S OWN DECLARATION and assert cortex's constant against it,
 * which is strictly stronger than asserting cortex against cortex.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { BOUND_SLOTS_FIELD, boundSlotsBody, toBoundSlots } from "./boundSlots";
import { ANSWERING_ARTIFACT_FIELD, answeringArtifactBody } from "./answeringArtifact";

/** The producer's gateway, when this machine has it checked out beside cortex. */
const GATEWAY = path.join(__dirname, "../../../invincible-agent/src/iagent/gateway.py");
const HAVE_GATEWAY = existsSync(GATEWAY);

describe("the field name", () => {
  it("is the one the gateway model declares", () => {
    // The floor, which always runs. The live read below is the real check; this one keeps a
    // machine without the sibling checkout from having no assertion at all.
    expect(BOUND_SLOTS_FIELD).toBe("bound_slots");
  });

  it.skipIf(!HAVE_GATEWAY)("matches the DECLARATION in gateway.py, read live", () => {
    // Not a copy of the name — the name as the server declares it. If the model is renamed and
    // cortex is not, this fails on the next run rather than on a demo.
    const src = readFileSync(GATEWAY, "utf8");
    const decl = src.match(/^\s*([a-z_]+):\s*dict\[str,\s*str\]\s*\|\s*None\s*=\s*None\s*$/m);
    expect(decl, "no `<name>: dict[str, str] | None = None` declaration found in gateway.py").toBeTruthy();
    expect(decl![1]).toBe(BOUND_SLOTS_FIELD);
  });

  it.skipIf(!HAVE_GATEWAY)("is the name the gateway READS, not merely one it declares", () => {
    // A declared-but-unread field is the advertised-unconsumed shape, and here it would be
    // indistinguishable from success: the pick would post, parse, and be ignored.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(new RegExp("request\\." + BOUND_SLOTS_FIELD + "\\b"));
  });
});

describe("the outgoing body is built from the constant, never a typed literal", () => {
  it("puts the pick under the key the gateway reads", () => {
    expect(boundSlotsBody({ capability_id: "C7" })).toEqual({
      bound_slots: { capability_id: "C7" },
    });
    expect(Object.keys(boundSlotsBody({ a: "b" }))).toEqual([BOUND_SLOTS_FIELD]);
  });

  it("omits the field entirely when there is no pick — ABSENT, not empty", () => {
    // `{bound_slots: {}}` is not "no pick": the server branches on the field being None and
    // validates whatever it finds against a recomputed menu, so an empty object is a CLAIM
    // that a menu was answered. Absent is the only honest way to say nobody picked.
    expect(boundSlotsBody(undefined)).toEqual({});
    expect(boundSlotsBody({})).toEqual({});
    expect(BOUND_SLOTS_FIELD in boundSlotsBody({})).toBe(false);
  });

  it("the send path uses that function rather than assembling the key itself", () => {
    // A source-level guard, matching how this repo already pins the interpreter's dispatch. A
    // literal `bound_slots:` at the call site would be correct TODAY and silent the day the
    // server renames it — the constant is what makes the rename a compile-time move.
    const hook = readFileSync(path.join(__dirname, "../hooks/useInterviewAgent.ts"), "utf8");
    expect(hook).toMatch(/\.\.\.boundSlotsBody\(boundSlots\)/);
    expect(hook).not.toMatch(/["']bound_slots["']\s*:/);
    // Positive control: if the assertions above stopped matching the file at all, this proves
    // we still read the file we think we read.
    expect(hook).toMatch(/mutationFn/);
  });

  it("the request type carries no `slots` field for a pick to land in by mistake", () => {
    const types = readFileSync(path.join(__dirname, "./types.ts"), "utf8");
    const interviewRequest = types.slice(
      types.indexOf("export interface InterviewRequest"),
      types.indexOf("// ── ADR-0026 entitlement matrix"),
    );
    expect(interviewRequest).toContain("bound_slots?: Record<string, string>");
    expect(interviewRequest).not.toMatch(/^\s*slots\??:/m);
  });
});

describe("toBoundSlots meets the type the gateway declares", () => {
  it("stringifies a non-string rather than letting it 422 the whole turn", () => {
    // `dict[str, str]` is declared and pydantic v2 does NOT coerce an int into a str, so one
    // numeric slot would reject the entire request — taking the message with it.
    expect(toBoundSlots({ program_id: "P1", wave: 2 })).toEqual({ program_id: "P1", wave: "2" });
  });

  it("drops nothing that carries a value, and keeps nothing that does not", () => {
    // A slot silently missing is the same silent-default failure one field further in, so the
    // only things removed are the ones that were never answers.
    expect(toBoundSlots({ a: "x", b: null, c: undefined, d: 0, e: false })).toEqual({
      a: "x",
      d: "0",
      e: "false",
    });
  });

  it("an empty map stays empty, so the caller can tell `no pick` from `a pick of nothing`", () => {
    // The distinction the send path depends on: `{}` posted is a CLAIM that a menu was
    // answered, against a server that branches on the field being absent.
    expect(toBoundSlots({})).toEqual({});
    expect(Object.keys(toBoundSlots({ a: null }))).toEqual([]);
  });
});

describe("the lineage claim", () => {
  it("uses the name the gateway declares", () => {
    expect(ANSWERING_ARTIFACT_FIELD).toBe("answering_artifact_id");
    expect(answeringArtifactBody("art-1")).toEqual({ answering_artifact_id: "art-1" });
  });

  it("is ABSENT when this turn answers no ask", () => {
    // An empty string is not a missing id — it is a claim to have answered an artifact with no
    // name, which the server refuses and which no caller means.
    expect(answeringArtifactBody(undefined)).toEqual({});
    expect(answeringArtifactBody(null)).toEqual({});
    expect(answeringArtifactBody("   ")).toEqual({});
  });

  it.skipIf(!HAVE_GATEWAY)("matches the DECLARATION in gateway.py, read live", () => {
    const src = readFileSync(GATEWAY, "utf8");
    // Written as a literal rather than assembled from the constant: building this pattern by
    // concatenation is how the escapes get eaten, and a regex that silently matches nothing is
    // the shape this repo has been bitten by three times.
    const decl = src.match(/^\s*([a-z_]+):\s*str\s*\|\s*None\s*=\s*None\s*$/gm) ?? [];
    expect(decl.some((d) => d.trim().startsWith(ANSWERING_ARTIFACT_FIELD + ":"))).toBe(true);
    expect(src).toContain("request." + ANSWERING_ARTIFACT_FIELD);
  });

  it.skipIf(!HAVE_GATEWAY)("is GUARDED there — the server decides, the client only claims", () => {
    // The write is a MERGE on the parent id, and MERGE CREATES what it cannot find. An
    // unguarded claim would not record a wrong parent; it would conjure an artifact into the
    // provenance graph by naming it, and the rail would fold two cards onto a lineage nobody
    // produced. The guard is the reason cortex may post this at all.
    const src = readFileSync(GATEWAY, "utf8");
    expect(src).toMatch(/_answers_something/);
    expect(src).toMatch(/derived_from_artifact_id/);
  });
});
