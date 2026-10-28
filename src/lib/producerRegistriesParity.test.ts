/**
 * REFACTOR ITEM 3, steps 8 and 9 -- two hand registries measured against the producer's CODE.
 *
 *   (8) `OBTAINED_VIA` (ingestWire.ts) vs `provenance.OBTAINED_VIA`, in the tuple's own order.
 *   (9) `LOCKED_STAGES` (IngestLeafChip.tsx) vs the stages `POST /ingest/{id}/leaf` will NOT take
 *       (`leaf_not_changeable`), parsed from the route's own dispatch in `gateway.py`.
 *
 * RUN WITH `npm run test`, never bare `npx vitest run` (see taskKindParity.test.tsx).
 * Producer lookup: `CORTEX_PRODUCER_ROOT`, then the sibling `invincible-agent` / `ia-01`. A root that
 * exists but lacks the file is a FAIL, never a skip. Measure from a `git archive` export of the pin.
 */
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { OBTAINED_VIA } from "./ingestWire";
import { LOCKED_STAGES } from "../components/ingest/IngestLeafChip";

const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function producerRoot(): string | null {
  const env = process.env.CORTEX_PRODUCER_ROOT;
  if (env) return env;
  for (const name of CANDIDATE_ROOTS) {
    const p = path.join(__dirname, "../../..", name);
    if (existsSync(p)) return p;
  }
  return null;
}

function readProducerFile(rel: string): string {
  const root = producerRoot();
  if (root === null) throw new Error("no producer root: set CORTEX_PRODUCER_ROOT or place invincible-agent / ia-01 beside this repo");
  const file = path.join(root, rel);
  if (!existsSync(file)) throw new Error(`producer root ${root} exists but lacks ${rel}`);
  return readFileSync(file, "utf8");
}

function stripCommentLines(src: string): string {
  return src.split(/\r?\n/).map((l) => (/^\s*#/.test(l) ? "" : l)).join("\n");
}

/** Every column-0 `A, B = "a", "b"` (possibly parenthesised across lines) and `A = "a"` -> name -> value. */
function pyStringNames(src: string): Map<string, string> {
  const out = new Map<string, string>();
  const code = stripCommentLines(src);
  const re = /^([A-Z_][A-Z0-9_]*(?:\s*,\s*[A-Z_][A-Z0-9_]*)*)\s*=\s*(\(?\s*"[^"\n]*"(?:\s*,\s*"[^"\n]*")*\s*\)?)\s*$/gm;
  for (const m of code.matchAll(re)) {
    const names = m[1].split(",").map((s) => s.trim());
    const vals = [...m[2].matchAll(/"([^"\n]*)"/g)].map((x) => x[1]);
    if (names.length !== vals.length) continue; // `LEAVES = ("pcn", "pdn")`: a tuple of values, not a name list
    names.forEach((n, i) => out.set(n, vals[i]));
  }
  return out;
}

/** `NAME = (A, B, ...)` at column 0 -> the identifiers, in the TUPLE's order. */
function pyNameTuple(src: string, name: string): string[] {
  const m = new RegExp(`^${name}\\s*=\\s*\\(([^)]*)\\)\\s*$`, "m").exec(stripCommentLines(src));
  if (!m) throw new Error(`${name}: no column-0 name tuple found`);
  return m[1].split(",").map((s) => s.trim()).filter(Boolean);
}

/** The stages the leaf route's dispatch names in an `if stage ...:` condition -> its changeable set. */
function changeableStages(gateway: string, consts: Map<string, string>): string[] {
  const code = stripCommentLines(gateway);
  const start = code.indexOf("async def ingest_leaf_route(");
  if (start < 0) throw new Error("ingest_leaf_route not found in gateway.py");
  const rest = code.slice(code.indexOf("\n", start));
  const endRel = rest.search(/^(?:@app\.|async def |def |[A-Za-z_])/m);
  const body = endRel < 0 ? rest : rest.slice(0, endRel);
  const found = new Set<string>();
  for (const m of body.matchAll(/\bif\s+(stage\b[^:]*?):\s*$/gm)) {
    for (const id of m[1].matchAll(/ingest_status\.([A-Z_]+)/g)) {
      const v = consts.get(id[1]);
      if (v === undefined) throw new Error(`leaf route names ingest_status.${id[1]}, not a string constant in ingest_status.py`);
      found.add(v);
    }
  }
  if (found.size === 0) throw new Error("no `if stage ...:` conditions parsed from ingest_leaf_route");
  return [...found];
}

describe("parser self-tests", () => {
  it("pyStringNames reads multi-name and parenthesised assignments", () => {
    const m = pyStringNames('A, B = "a", "b"\nC = "c"\nD, E = (\n    "d", "e")\n# F = "f"\n');
    expect([...m.entries()]).toEqual([["A", "a"], ["B", "b"], ["C", "c"], ["D", "d"], ["E", "e"]]);
  });
  it("pyNameTuple keeps the tuple's own order", () => {
    expect(pyNameTuple("T = (B, A)\n", "T")).toEqual(["B", "A"]);
  });
  it("changeableStages throws when nothing parses", () => {
    expect(() => changeableStages("async def ingest_leaf_route(x):\n    pass\n", new Map())).toThrow(/no `if stage/);
  });
  it("changeableStages reads a multi-line condition", () => {
    const g = "async def ingest_leaf_route(x):\n    if stage in (ingest_status.A, ingest_status.B) or (\n            stage == ingest_status.C and y):\n        pass\n";
    expect(changeableStages(g, new Map([["A", "a"], ["B", "b"], ["C", "c"]])).sort()).toEqual(["a", "b", "c"]);
  });
});

describe("producer registries parity", () => {
  it("OBTAINED_VIA equals provenance.OBTAINED_VIA, same order (step 8)", () => {
    const src = readProducerFile("src/iagent/provenance.py");
    const consts = pyStringNames(src);
    const names = pyNameTuple(src, "OBTAINED_VIA");
    const values = names.map((n) => {
      const v = consts.get(n);
      if (v === undefined) throw new Error(`provenance.OBTAINED_VIA names ${n}, which has no string constant`);
      return v;
    });
    expect(values.length).toBeGreaterThan(0);
    expect([...OBTAINED_VIA]).toEqual(values);
  });

  it("LOCKED_STAGES vs the leaf route's leaf_not_changeable rule (step 9)", () => {
    const status = readProducerFile("src/iagent/ingest_status.py");
    const consts = pyStringNames(status);
    const changeable = new Set(changeableStages(readProducerFile("src/iagent/gateway.py"), consts));
    // every status a leaf-capable row can sit at; `duplicate` / `case_opened` are row kinds with no
    // leaf (409 no_leaf_for_kind), never reaching this rule.
    const allBlock = /^ALL_STATUSES\s*=\s*STAGES\s*\+\s*\(([^)]*)\)/m.exec(stripCommentLines(status));
    if (!allBlock) throw new Error("ALL_STATUSES = STAGES + (...) not found in ingest_status.py");
    const names = [...pyNameTuple(status, "STAGES"), ...allBlock[1].split(",").map((s) => s.trim()).filter(Boolean)];
    const all = names
      .map((n) => {
        const v = consts.get(n);
        if (v === undefined) throw new Error(`ALL_STATUSES names ${n}, which has no string constant`);
        return v;
      })
      .filter((v) => v !== consts.get("DUPLICATE") && v !== consts.get("CASE_OPENED"));
    for (const c of changeable) expect(all).toContain(c);
    const serverLocked = all.filter((s) => !changeable.has(s)).sort();
    const cortexLocked = [...LOCKED_STAGES].sort();
    // Cortex must lock everything the server refuses (a Change button there is only refused)...
    expect(serverLocked.filter((s) => !cortexLocked.includes(s))).toEqual([]);
    // ...and the ONLY stage cortex locks that the server would take is `failed` -- a KNOWN divergence
    // (IngestLeafChip.tsx LOCKED_STAGES; gateway.py docstring: "received, extracting, failed ->
    // set_leaf(corrected) in place"). Behaviour is not changed by item 3; this arm goes red the day
    // either side moves, so the divergence cannot drift unseen.
    expect(cortexLocked.filter((s) => !serverLocked.includes(s))).toEqual(["failed"]);
  });
});

describe("the seal RAN", () => {
  it("found a producer root", () => {
    expect(producerRoot()).not.toBeNull();
  });
});
