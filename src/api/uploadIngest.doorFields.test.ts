/**
 * THE DOOR-FIELDS SEAL — every multipart field `uploadIngest` SENDS must be a field the door
 * (`gateway.py` `ingest_document`) DECLARES as a `File(...)`/`Form(...)` parameter.
 *
 * Why: FastAPI silently drops a form field the route does not declare. A field the server
 * discards turns every green arm on the send side into nothing (the cortex tests prove the field
 * is SENT; only the receiver's honour condition proves it is KEPT). So this seal mirrors the
 * receiver's keep-condition as a predicate beside the send.
 *
 * AWAITING_DOOR names fields cortex sends that the door does not declare YET. An entry must expire
 * by COMPUTATION, not prose: arm B reds the moment the door declares the field, telling you to
 * delete the entry.
 *
 * RUN WITH `npm run test`, not bare `npx vitest run` (same `describe.skipIf` reason as
 * `src/lib/ingestKindStatusParity.test.ts`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { AxiosAdapter, InternalAxiosRequestConfig } from "axios";

const { seen } = vi.hoisted(() => ({ seen: [] as InternalAxiosRequestConfig[] }));

vi.mock("axios", async (importOriginal) => {
  const mod = await importOriginal<typeof import("axios")>();
  const real = mod.default;
  const realCreate = real.create.bind(real);
  const capture: AxiosAdapter = async (config) => {
    seen.push(config);
    return { data: { ingest_id: "sha256:abc" }, status: 201, statusText: "Created", headers: {}, config };
  };
  const wrapped = Object.assign(Object.create(real), {
    create: (cfg?: Parameters<typeof real.create>[0]) => {
      const inst = realCreate(cfg);
      inst.defaults.adapter = capture;
      return inst;
    },
  });
  return { ...mod, default: wrapped };
});

import { uploadIngest } from "./client";

/** field -> why the door does not declare it yet. */
// EMPTY IS THE HEALTHY STATE: `leaf` was the last entry and left when the door declared it (0843efed,
// 207), so arm B now loops over nothing. That is not a vacuous seal — arm A still checks every field
// sent against the door's declared set — it is a record with no live exceptions. Add an entry only for
// a field cortex sends that the pinned door really lacks, and arm B will name the day to delete it.
const AWAITING_DOOR: Record<string, string> = {};

// ── the parser ──────────────────────────────────────────────────────────────────────────────

/** Splits on commas at paren/bracket depth 0. */
function splitTopLevel(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

/** The parameter names of `async def ingest_document(...)` whose default is `File(` or `Form(`.
 *  Throws (never returns []) when the def or its closing paren is not found. */
function parseDoorFields(src: string): string[] {
  const m = /async\s+def\s+ingest_document\s*\(/.exec(src);
  if (!m) throw new Error("no `async def ingest_document(` found");
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  for (; i < src.length && depth > 0; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")") depth--;
  }
  if (depth !== 0) throw new Error("ingest_document signature never closes");
  const names: string[] = [];
  for (const p of splitTopLevel(src.slice(start, i - 1))) {
    const pm = /^\s*([A-Za-z_]\w*)\s*(?::[^=]*)?=\s*(File|Form)\s*\(/s.exec(p);
    if (pm) names.push(pm[1]);
  }
  return names;
}

describe("parseDoorFields (on fixture strings, before the real file)", () => {
  it("reads File/Form params, single-line and multi-line, with Optional[...]", () => {
    const src = [
      "async def ingest_document(",
      "    file: UploadFile = File(...),",
      "    kind: str = Form(...),",
      "    content_kind: Optional[str] = Form(",
      "        None",
      "    ),",
      "):",
      "    pass",
    ].join("\n");
    expect(parseDoorFields(src)).toEqual(["file", "kind", "content_kind"]);
  });
  it("excludes non-Form params such as Depends(...)", () => {
    const src =
      "async def ingest_document(file: UploadFile = File(...), current_user: User = Depends(get_current_user)) -> dict:\n    pass";
    expect(parseDoorFields(src)).toEqual(["file"]);
  });
  it("throws when the def is missing", () => {
    expect(() => parseDoorFields("async def other(a: int = Form(1)):\n  pass")).toThrow(/ingest_document/);
  });
});

// ── what cortex SENDS (the real uploadIngest, the real axios pipeline) ───────────────────────

beforeEach(() => {
  seen.length = 0;
});

async function sentFields(): Promise<string[]> {
  await uploadIngest(new File(["%PDF-1.4\n"], "a.pdf"), "pdf", "alice@example.com", "pdf", "pcn");
  return [...new Set((seen[0].data as FormData).keys())];
}

// ── the live comparand ──────────────────────────────────────────────────────────────────────

const CANDIDATE_ROOTS = ["invincible-agent", "ia-01"];

function resolveProducers(): { root: string; file: string }[] {
  const found: { root: string; file: string }[] = [];
  for (const name of CANDIDATE_ROOTS) {
    const file = path.join(__dirname, "../../..", name, "src/iagent/gateway.py");
    if (existsSync(file)) found.push({ root: name, file });
  }
  return found;
}

const PRODUCERS = resolveProducers();
const HAVE_PRODUCER = PRODUCERS.length > 0;
const PRODUCER_REF = (process.env.CORTEX_PRODUCER_REF || "").trim();
const PRODUCER_AT = PRODUCER_REF
  ? `producer at ${PRODUCER_REF.slice(0, 7)}`
  : "producer at the local checkout (UNPINNED — this is CI-pinned only)";

describe.skipIf(!HAVE_PRODUCER)("uploadIngest's fields against gateway.py's ingest_document", () => {
  const door = () => new Set(parseDoorFields(readFileSync(PRODUCERS[0].file, "utf8")));

  it("control: the parsed door has file, kind, on_behalf_of (a broken parse cannot pass)", () => {
    for (const f of ["file", "kind", "on_behalf_of"]) expect(door().has(f), `${f} missing; ${PRODUCER_AT}`).toBe(true);
  });

  it("control: the send includes leaf when one is given (the capture is live)", async () => {
    expect(await sentFields()).toContain("leaf");
  });

  it("arm A: every field sent, minus AWAITING_DOOR, is a door field", async () => {
    const d = door();
    const unknown = (await sentFields()).filter((f) => !(f in AWAITING_DOOR) && !d.has(f));
    expect(
      unknown,
      `cortex sends ${unknown.join(", ")} but the door does not declare it — FastAPI drops it; ${PRODUCER_AT}`,
    ).toEqual([]);
  });

  it("arm B: every AWAITING_DOOR field is NOT YET a door field", () => {
    const d = door();
    for (const f of Object.keys(AWAITING_DOOR)) {
      expect(d.has(f), `the door now declares ${f}: delete it from AWAITING_DOOR; ${PRODUCER_AT}`).toBe(false);
    }
  });
});

describe("the seal RAN, or says so", () => {
  it("resolved a producer checkout", () => {
    expect(
      PRODUCERS.length,
      `no producer checkout found under any of ${CANDIDATE_ROOTS.join(", ")} — this seal SKIPPED ENTIRELY and verified nothing.`,
    ).toBeGreaterThan(0);
  });
});
