/**
 * The OpenAPI snapshots, the types generated from them, and the producer they were taken from.
 *
 *   1. generation: generate() over each committed snapshot equals the committed src/api/generated file.
 *   2. SOURCES:    each snapshot's sha256 equals its SOURCES.json entry (a hand-edited snapshot cannot hide).
 *   3. drift:      the BFF snapshot deep-equals the producer's docs/api/cortex-bff.openapi.json.
 *   4. v1 expiry:  every op the client types from ingest-v1 (V1_SOURCED) is still UNDECLARED in the BFF
 *                  snapshot, and still declared in v1 -- the day the BFF declares one, this goes red.
 *
 * Arm 3 reads a PEER repo, so it is censused by scripts/check-cross-repo-seals.mjs (CANDIDATE_ROOTS below).
 * Skipped only when NO producer root exists at all; a root that exists but lacks the file FAILS.
 */
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { deepStrictEqual } from "node:assert";
import { generate } from "../../scripts/gen-api-types.mjs";
import { V1_SOURCED } from "./client";

const here = __dirname;
const read = (p: string) => readFileSync(path.join(here, p), "utf8");

const SNAPSHOTS = [
  { file: "cortex-bff.openapi.json", generated: "bff.ts" },
  { file: "ingest-v1.openapi.json", generated: "ingestV1.ts" },
] as const;

const SOURCES = JSON.parse(read("openapi/SOURCES.json")) as Record<string, { sha: string; sha256: string; path: string }>;
const bff = JSON.parse(read("openapi/cortex-bff.openapi.json"));
const v1 = JSON.parse(read("openapi/ingest-v1.openapi.json"));

describe("generation: the committed types are what the generator makes of the committed snapshot", () => {
  for (const s of SNAPSHOTS) {
    it(`${s.file} -> generated/${s.generated}`, () => {
      const doc = JSON.parse(read(`openapi/${s.file}`));
      const made = generate(doc, { sourceName: s.file, sha: SOURCES[s.file].sha });
      expect(made === read(`generated/${s.generated}`), `generated/${s.generated} is stale -- run npm run gen:api`).toBe(true);
    });
  }
});

describe("SOURCES.json names the bytes that are committed", () => {
  for (const s of SNAPSHOTS) {
    it(`${s.file} sha256 equals its SOURCES entry`, () => {
      const got = createHash("sha256").update(readFileSync(path.join(here, "openapi", s.file))).digest("hex");
      expect(got, `${s.file} was edited after it was taken from ${SOURCES[s.file].sha.slice(0, 7)}`).toBe(SOURCES[s.file].sha256);
    });
  }
});

// ── drift against the producer ──────────────────────────────────────────────────────────────
const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function producerRoot(): string | null {
  const env = (process.env.CORTEX_PRODUCER_ROOT || "").trim();
  if (env && existsSync(env)) return env;
  for (const name of CANDIDATE_ROOTS) {
    const root = path.join(__dirname, "../../..", name);
    if (existsSync(root)) return root;
  }
  return null;
}

const ROOT = producerRoot();

describe("drift: the BFF snapshot is the producer's document", () => {
  it.skipIf(ROOT === null)("deep-equals the producer's docs/api/cortex-bff.openapi.json", () => {
    const file = path.join(ROOT as string, "docs/api/cortex-bff.openapi.json");
    expect(
      existsSync(file),
      `producer at ${ROOT} has no docs/api/cortex-bff.openapi.json -- the pin predates 2705c335`,
    ).toBe(true);
    const live = JSON.parse(readFileSync(file, "utf8"));
    let drift = "";
    try {
      deepStrictEqual(bff, live);
    } catch (e) {
      drift = String((e as Error).message).slice(0, 400);
    }
    expect(drift, "the committed BFF snapshot differs from the producer's -- re-take it and run npm run gen:api").toBe("");
  });
});

// ── the v1 expiry ──────────────────────────────────────────────────────────────────────────
type Doc = { paths: Record<string, Record<string, { responses?: Record<string, { content?: Record<string, { schema?: unknown }> }> }>> };

function declares200Json(doc: Doc, op: string): boolean {
  const i = op.indexOf(" ");
  const method = op.slice(0, i).toLowerCase();
  const p = op.slice(i + 1);
  const schema = doc.paths[p]?.[method]?.responses?.["200"]?.content?.["application/json"]?.schema;
  return schema !== undefined && Object.keys(schema as object).length > 0;
}

describe("v1 expiry: V1_SOURCED ops are typed from ingest-v1 only while the BFF is silent about them", () => {
  it("V1_SOURCED is not empty", () => {
    expect(V1_SOURCED.length).toBeGreaterThan(0);
  });
  for (const op of V1_SOURCED) {
    it(`${op}: undeclared in the BFF snapshot, declared in v1`, () => {
      expect(
        declares200Json(bff, op),
        `the BFF document now declares ${op} -- type it from bff.ts and drop it from V1_SOURCED`,
      ).toBe(false);
      expect(declares200Json(v1, op), `${op} is in V1_SOURCED but ingest-v1 declares no 200 JSON schema for it`).toBe(true);
    });
  }
});
