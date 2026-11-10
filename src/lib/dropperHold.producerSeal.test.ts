/**
 * THE PRODUCER SEAL for the dropper hold (ingest 1.9.0, invincible-agent #324). The card holds Promote
 * when the viewer is in `payload[ATTESTATION_FIELD][ATTESTATION_EXCLUDED]`. That is honest only while
 * the card's hold and the act route's 403 are the same condition. Checked here against the producer:
 *
 *   1. filing stamps `payload[ATTESTATION_FIELD]` from `promotion.attestation_block`;
 *   2. that block's list is `ATTESTATION_EXCLUDED`, and under `second_party` it is exactly
 *      `_excluded_attesters(payload)`, else empty;
 *   3. the act route refuses PROMOTED when the block's mode is `second_party` and `acted_by` is in
 *      `_excluded_attesters(payload)`, with a code cortex reads as a structural 403 (the server's text).
 *
 * 2 and 3 are the same set at filing time, so the hold and the refusal agree. They are NOT the same
 * FIELD. At de1873c2 the route reads the block's `mode` and recomputes the set from `dropped_by`; it does
 * not read `excluded`. The last arm is an `it.fails` tripwire for that: it goes red the day the route
 * reads `excluded`, and should then become an ordinary arm.
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
});

describe.skipIf(ROOT === null)("the card's hold and the route's 403 are one condition", () => {
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

  it("the route refuses PROMOTED under the block's second_party mode when acted_by is in _excluded_attesters", () => {
    const sec = code(routeSection(read(PROMOTION)));
    expect(sec, `${AT}: the act route's attestation section was not found`).not.toBe("");
    expect(sec, `${AT}: the route does not take its mode from the served block`).toMatch(/mode = block\["mode"\]/);
    expect(sec, `${AT}: the route's excluded set is not _excluded_attesters(payload)`).toMatch(
      /self_attested = acted_by in _excluded_attesters\(payload\)/,
    );
    expect(sec, `${AT}: the route's refusal is not second_party AND self_attested`).toMatch(
      /if mode == ATTESTATION_SECOND_PARTY and self_attested:/,
    );
  });

  it("the route's 403 code is one cortex draws with the server's text", () => {
    const sec = code(routeSection(read(PROMOTION)));
    const m = /if mode == ATTESTATION_SECOND_PARTY and self_attested:\s*raise PromotionRefused\(\s*"([a-z_]+)"[\s\S]*?status=(\d+)\)/.exec(sec);
    expect(m, `${AT}: no PromotionRefused under the second_party branch`).not.toBeNull();
    expect(m![2], `${AT}: the refusal is not a 403`).toBe("403");
    expect(StructuralRefusalDetail_error as readonly string[], `${AT}: "${m![1]}" is not a StructuralRefusalDetail code`).toContain(m![1]);
  });

  it("the route section the tripwire reads exists (so the tripwire cannot pass on a missing file)", () => {
    expect(code(routeSection(read(PROMOTION)))).not.toBe("");
  });

  // TRIPWIRE. Passes while the route does NOT read `excluded`; red the day it does. Then make it `it`.
  it.fails("the route reads the served excluded list itself", () => {
    const sec = code(routeSection(read(PROMOTION)));
    expect(sec).toMatch(new RegExp(`block(\\.get\\(|\\[)"${ATTESTATION_EXCLUDED}"`));
  });
});
