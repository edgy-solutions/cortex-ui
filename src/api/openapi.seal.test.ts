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

/** Every "METHOD /path" in `doc` with a non-empty 200 JSON schema. */
function ops200(doc: Doc): string[] {
  return Object.entries(doc.paths).flatMap(([p, methods]) =>
    Object.keys(methods)
      .map((m) => `${m.toUpperCase()} ${p}`)
      .filter((op) => declares200Json(doc, op)),
  );
}

// V1_SOURCED has been empty since b59e4a0f, when the BFF declared all nine ops it held. The per-op
// loop then runs over nothing. So the arm below keeps the suite from being a record of nothing: the
// empty list is a COMPUTED claim, and it goes red the day ingest-v1 again declares a response the
// pinned BFF does not. Its population is every op the BFF knows, called or not, and that is wider
// than cortex needs. Aimed at the 2705c335 BFF it names 11 ops: the nine that were listed, plus
// GET /ingest/retries and POST /ingest/{ingest_id}/title_leaf, which no cortex code calls. Listing
// an uncalled op is harmless; a called op going unlisted is not.
describe("v1 expiry: V1_SOURCED ops are typed from ingest-v1 only while the BFF is silent about them", () => {
  it("every op v1 declares a 200 for, which the BFF knows but leaves silent, is in V1_SOURCED", () => {
    const listed = new Set<string>(V1_SOURCED);
    const ahead = ops200(v1).filter((op) => {
      const i = op.indexOf(" ");
      return bff.paths[op.slice(i + 1)]?.[op.slice(0, i).toLowerCase()] !== undefined && !declares200Json(bff, op);
    });
    expect(ops200(v1).length, "ingest-v1 declares no 200 JSON op at all -- the census read nothing").toBeGreaterThan(0);
    expect(
      ahead.filter((op) => !listed.has(op)),
      "ingest-v1 types these responses and the BFF snapshot does not -- list them in V1_SOURCED",
    ).toEqual([]);
  });
  for (const op of V1_SOURCED as readonly string[]) {
    it(`${op}: undeclared in the BFF snapshot, declared in v1`, () => {
      expect(
        declares200Json(bff, op),
        `the BFF document now declares ${op} -- type it from bff.ts and drop it from V1_SOURCED`,
      ).toBe(false);
      expect(declares200Json(v1, op), `${op} is in V1_SOURCED but ingest-v1 declares no 200 JSON schema for it`).toBe(true);
    });
  }
});
