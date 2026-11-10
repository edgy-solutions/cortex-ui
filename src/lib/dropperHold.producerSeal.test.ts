/**
 * THE PRODUCER SEAL for the dropper hold (ingest 1.9.1, invincible-agent #325). The card holds Promote
 * when the viewer is in `payload[ATTESTATION_FIELD][ATTESTATION_EXCLUDED]`. That is honest only while
 * the card's hold and the act route's 403 read the same field. Checked here:
 *
 *   0. the wire DECLARES it: the ingest-v1 snapshot's `TaskPayload` carries `ATTESTATION_FIELD` as an
 *      `Attestation` whose `ATTESTATION_EXCLUDED` is a required list of strings (no producer needed);
 *   1. filing stamps `payload[ATTESTATION_FIELD]` from `promotion.attestation_block`;
 *   2. that block's list is `ATTESTATION_EXCLUDED`, and under `second_party` it is exactly
 *      `_excluded_attesters(payload)`, else empty;
 *   3. the act route binds the served `ATTESTATION_EXCLUDED` and refuses PROMOTED when the block's mode
 *      is `second_party` and `acted_by` is in THAT list. Nothing recomputed from `dropped_by` (the
 *      `self_attested` record) appears in the refusal's condition;
 *   4. the refusal is a 403 whose code cortex reads as structural (the server's text).
 *
 * Until #325 the route recomputed the set from `dropped_by`; an `it.fails` tripwire stood here for
 * that, and arm 3 is what it became.
 *
 * Producer lookup follows `reviewExportCapability.producerSeal.test.ts`. RUN WITH `npm run test`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ATTESTATION_EXCLUDED, ATTESTATION_FIELD } from "./dropperHold";
import { StructuralRefusalDetail_error } from "@/api/generated/bff";

const PROMOTION = "src/iagent/promotion.py";
const GATEWAY = "src/iagent/gateway.py";

/** Spelled this way so `scripts/check-cross-repo-seals.mjs` censuses this file (it keys on the name). */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function findRoot(): string | null {
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, PROMOTION))) return env;
  for (const name of CANDIDATE_ROOTS) {
    const p = path.join(__dirname, "../../..", name);
    if (existsSync(path.join(p, PROMOTION))) return p;
  }
  return null;
}
const ROOT = findRoot();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

const read = (rel: string) => readFileSync(path.join(ROOT!, rel), "utf8").replace(/\r\n/g, "\n");

/** The body of top-level `def name(`, up to the next top-level statement; "" when there is none. */
function defBody(src: string, name: string): string {
  const m = new RegExp(`^def ${name}\\(.*$`, "m").exec(src);
  if (!m) return "";
  const rest = src.slice(m.index + m[0].length);
  const end = /\n(?=\S)/.exec(rest);
  return end ? rest.slice(0, end.index) : rest;
}

/** The act route's PROMOTED attestation section: from reading the block to the store check. "" when absent. */
function routeSection(src: string): string {
  const a = src.indexOf(`block = payload.get("${ATTESTATION_FIELD}")`);
  if (a < 0) return "";
  const b = src.indexOf("missing = _missing(", a);
  return b < 0 ? "" : src.slice(a, b);
}

/** Python comments stripped, so an anchor cannot match a comment instead of code. */
const code = (s: string) => s.replace(/#.*$/gm, "");

/** The name the route binds the served list to: `<name> = block.get("excluded")` or `block["excluded"]`. */
function servedListName(sec: string): string | null {
  return new RegExp(`^\\s*(\\w+)\\s*=\\s*block(?:\\.get\\(|\\[)"${ATTESTATION_EXCLUDED}"`, "m").exec(sec)?.[1] ?? null;
}

/** The `if` whose condition tests `acted_by in …` and raises a PromotionRefused: its condition, code and status. */
function actorRefusal(sec: string): { cond: string; code: string; status: string } | null {
  const m = /^\s*if ([^\n]*\bacted_by in [^\n]*):\s*raise PromotionRefused\(\s*"([a-z_]+)"[\s\S]*?status=(\d+)\)/m.exec(sec);
  return m ? { cond: m[1]!, code: m[2]!, status: m[3]! } : null;
}

describe("the parsers, unit-tested on fixtures", () => {
  it("defBody stops at the next top-level statement", () => {
    const py = "def a(x):\n    return 1\n\n\ndef b():\n    pass\n";
    expect(defBody(py, "a")).toBe("\n    return 1\n\n");
    expect(defBody(py, "c")).toBe("");
  });
  it("routeSection needs both anchors", () => {
    expect(routeSection(`block = payload.get("${ATTESTATION_FIELD}")\n  x\nmissing = _missing(s)`)).toContain("x");
    expect(routeSection(`block = payload.get("${ATTESTATION_FIELD}")\n  x\n`)).toBe("");
  });
  it("code() strips a comment, not the code before it", () => {
    expect(code('a = 1  # block["excluded"]')).toBe("a = 1  ");
  });
  it("servedListName reads either spelling and only an assignment from the block", () => {
    expect(servedListName(`    ex = block.get("${ATTESTATION_EXCLUDED}") if x else None`)).toBe("ex");
    expect(servedListName(`    ex = block["${ATTESTATION_EXCLUDED}"]`)).toBe("ex");
    expect(servedListName(`    ex = other.get("${ATTESTATION_EXCLUDED}")`)).toBeNull();
  });
  it("actorRefusal takes the acted_by condition, not a refusal on another condition", () => {
    const py = [
      '    if not ok:',
      '        raise PromotionRefused("attestation_undeclarable", "m", status=503)',
      '    self_attested = acted_by in _excluded_attesters(payload)',
      '    if mode == X and acted_by in ex:',
      '        raise PromotionRefused(',
      '            "dropper_cannot_attest_origin",',
      '            "m", status=403)',
    ].join("\n");
    expect(actorRefusal(py)).toEqual({ cond: "mode == X and acted_by in ex", code: "dropper_cannot_attest_origin", status: "403" });
    expect(actorRefusal(py.split("\n").slice(0, 3).join("\n"))).toBeNull();
  });
});

describe("the wire declares what the card reads (ingest-v1 snapshot)", () => {
  const v1 = JSON.parse(readFileSync(path.join(__dirname, "../api/openapi/ingest-v1.openapi.json"), "utf8"));
  const schemas = v1.components.schemas;
  it(`TaskPayload.${ATTESTATION_FIELD} is an Attestation, and HumanTask.payload is a TaskPayload`, () => {
    expect(schemas.TaskPayload?.properties?.[ATTESTATION_FIELD]?.$ref).toBe("#/components/schemas/Attestation");
    expect(JSON.stringify(schemas.HumanTask?.properties?.payload)).toContain('"#/components/schemas/TaskPayload"');
  });
  it(`Attestation.${ATTESTATION_EXCLUDED} is a required list of strings`, () => {
    const a = schemas.Attestation;
    expect(a?.properties?.[ATTESTATION_EXCLUDED]).toMatchObject({ type: "array", items: { type: "string" } });
    expect(a?.required).toContain(ATTESTATION_EXCLUDED);
  });
});

describe.skipIf(ROOT === null)("the card's hold and the route's 403 read one field", () => {
  it("filing stamps payload[ATTESTATION_FIELD] from attestation_block", () => {
    const gw = code(read(GATEWAY));
    expect(gw, `${AT}: gateway.py does not stamp payload["${ATTESTATION_FIELD}"] = promotion.attestation_block(...)`).toMatch(
      new RegExp(`payload\\["${ATTESTATION_FIELD}"\\]\\s*=\\s*promotion\\.attestation_block\\(`),
    );
  });

  it("the block's list is ATTESTATION_EXCLUDED: _excluded_attesters under second_party, else empty", () => {
    const body = code(defBody(read(PROMOTION), "attestation_block"));
    expect(body, `${AT}: no attestation_block in promotion.py`).not.toBe("");
    expect(body, `${AT}: attestation_block does not serve "${ATTESTATION_EXCLUDED}" from _excluded_attesters under second_party`).toMatch(
      new RegExp(`"${ATTESTATION_EXCLUDED}":\\s*sorted\\(_excluded_attesters\\(payload\\)\\)\\s*if m == ATTESTATION_SECOND_PARTY\\s*else \\[\\]`),
    );
  });

  it("the route binds the served excluded list", () => {
    const sec = code(routeSection(read(PROMOTION)));
    expect(sec, `${AT}: the act route's attestation section was not found`).not.toBe("");
    expect(servedListName(sec), `${AT}: the route does not read block["${ATTESTATION_EXCLUDED}"]`).not.toBeNull();
  });

  it("the route refuses under the block's second_party mode when acted_by is in that served list, and nothing recomputed decides", () => {
    const sec = code(routeSection(read(PROMOTION)));
    expect(sec, `${AT}: the route does not take its mode from the served block`).toMatch(/mode = block\["mode"\]/);
    const list = servedListName(sec);
    const r = actorRefusal(sec);
    expect(r, `${AT}: no PromotionRefused under an acted_by condition`).not.toBeNull();
    expect(r!.cond, `${AT}: the refusal is not under second_party`).toMatch(/\bmode == ATTESTATION_SECOND_PARTY\b/);
    expect(r!.cond, `${AT}: the refusal does not test acted_by against the served list "${list}"`).toMatch(
      new RegExp(`\\bacted_by in ${list}\\b(?!\\()`),
    );
    expect(r!.cond, `${AT}: a set recomputed from dropped_by decides the refusal`).not.toMatch(/_excluded_attesters|self_attested/);
  });

  it("the route's 403 code is one cortex draws with the server's text", () => {
    const r = actorRefusal(code(routeSection(read(PROMOTION))));
    expect(r, `${AT}: no PromotionRefused under an acted_by condition`).not.toBeNull();
    expect(r!.status, `${AT}: the refusal is not a 403`).toBe("403");
    expect(StructuralRefusalDetail_error as readonly string[], `${AT}: "${r!.code}" is not a StructuralRefusalDetail code`).toContain(r!.code);
  });
});
