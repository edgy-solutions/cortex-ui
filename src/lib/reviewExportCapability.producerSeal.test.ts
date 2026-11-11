/**
 * THE PRODUCER SEAL for the batch control's capability. `canExportBatch` shows the control when the served
 * `capabilities` list carries `EXPORT_BATCH_CAPABILITY`. That is honest only while two producer facts hold:
 *
 *   1. the key is a row of `policy/capability_grants.yaml` (a misspelt key is never served, so the control
 *      silently never shows), and
 *   2. the door the control calls, `POST EXPORT_NOTICES_PATH`, is gated in `endpoint_gating_manifest.yaml` on
 *      `can_invoke(<that key>)` -- so "shown" and "admitted" are the same condition. If the door moves to
 *      another key, the control would offer a door that refuses.
 *
 * Producer lookup follows `presentationProvenance.producerSeal.test.ts`: `CORTEX_PRODUCER_ROOT`, else a sibling
 * `invincible-agent` / `ia-01`; measure from a `git archive` export at the pinned ref (`CORTEX_PRODUCER_REF`).
 * RUN WITH `npm run test`, never bare `npx vitest run`.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { EXPORT_BATCH_CAPABILITY, EXPORT_NOTICES_PATH } from "./reviewExport";

const GRANTS = "policy/capability_grants.yaml";
const MANIFEST = "docs/architecture/endpoint_gating_manifest.yaml";

/** Spelled this way so `scripts/check-cross-repo-seals.mjs` censuses this file (it keys on the name). */
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function findRoot(): string | null {
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(path.join(env, GRANTS))) return env;
  for (const name of CANDIDATE_ROOTS) {
    const p = path.join(__dirname, "../../..", name);
    if (existsSync(path.join(p, GRANTS))) return p;
  }
  return null;
}
const ROOT = findRoot();
const REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const AT = REF ? `producer at ${REF.slice(0, 7)}` : "producer (CORTEX_PRODUCER_REF unset)";

const read = (rel: string) => readFileSync(path.join(ROOT!, rel), "utf8").replace(/\r\n/g, "\n");

/** The top-level keys of the `capabilities:` map: two-space indent, ending in `:`. */
function grantKeys(src: string): string[] {
  return [...src.matchAll(/^ {2}([A-Za-z_][\w:.-]*):[ \t]*$/gm)].map((m) => m[1]!);
}

/** The `gate:` text of the manifest entry for exactly `method path`, or null when no entry names it. */
function gateFor(src: string, method: string, route: string): string | null {
  for (const entry of src.split(/\n(?= +- method: )/)) {
    const m = /^ +- method: (\S+)\n +path: (\S+)\n/.exec(entry);
    if (!m || m[1] !== method || m[2] !== route) continue;
    const g = /^ +gate: (.*)$/m.exec(entry);
    return g ? g[1]! : "";
  }
  return null;
}

describe("the parsers, unit-tested on fixtures", () => {
  it("grantKeys reads the two-space keys and not the nested ones", () => {
    const y = "capabilities:\n  can_drop:pcn:\n    granted_by: seed\n  ingest:exportBatch:\n    reason: >-\n      x\n";
    expect(grantKeys(y)).toEqual(["can_drop:pcn", "ingest:exportBatch"]);
  });
  it("gateFor matches method AND path exactly, not a longer path", () => {
    const y =
      "      - method: GET\n        path: /a/{id}/export\n        gate: \"can_invoke(x)\"\n" +
      "      - method: POST\n        path: /a/export\n        gate: \"post gate\"\n" +
      "      - method: GET\n        path: /a/export\n        identity: k\n        gate: \"can_invoke(y)\"\n";
    expect(gateFor(y, "GET", "/a/export")).toBe('"can_invoke(y)"');
    expect(gateFor(y, "GET", "/b")).toBeNull();
  });
});

describe.skipIf(ROOT === null)("the batch capability is the producer's, and its door's", () => {
  it("the key cortex reads is a row of policy/capability_grants.yaml", () => {
    const keys = grantKeys(read(GRANTS));
    expect(keys.length, `${AT}: no capability rows read -- the parser read nothing`).toBeGreaterThan(0);
    expect(keys, `${AT}: ${EXPORT_BATCH_CAPABILITY} is not a capability row`).toContain(EXPORT_BATCH_CAPABILITY);
  });
  it("the batch door is gated on can_invoke of that same key", () => {
    const gate = gateFor(read(MANIFEST), "POST", EXPORT_NOTICES_PATH);
    expect(gate, `${AT}: the manifest has no POST ${EXPORT_NOTICES_PATH} entry`).not.toBeNull();
    expect(gate, `${AT}: POST ${EXPORT_NOTICES_PATH} is not gated on the key the control shows on`).toContain(
      `can_invoke(${EXPORT_BATCH_CAPABILITY})`,
    );
  });
});
