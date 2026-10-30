# 2026-10-30 report: case panel (4d6dd208), export picker on #154 (e772cca), card-declaration schema (0fd6d6d)

**Directive (Chris, relayed):**
- "case-panel digest by 12:00Z (ruled)";
- then the export picker against Lane 1's #154 profiles (a fixture until rolled);
- the plan-recipient rows per answer;
- the card-declaration JSON schema, as a doc only.

After the reboot: "all three: place the fe4d787 packet now (Lane 1 is pinning it); review e772cca under the full
gate and push; the card-declaration schema doc."

## 1. Case panel: D1 + D2 from lane 01's #155 packet

| | |
|---|---|
| sha | `fe4d7879ac4c86a83bbc958565be11688bffd0cf` (head of e442dfa..fe4d787) |
| CI run | `41001044734`: success, "Build and push frontend image (multi-arch)" ran |
| digest | `sha256:4d6dd2085a005ff5790d4104ad6a5c9b1e73525d43e90592be8200df91c58555`, an OCI index for linux/amd64 and linux/arm64 |
| controls | `c9fa49183d69…` (non-head, FULL sha) returns 404; `42c470c0…` still returns `e0346d51…` |

**The packet was LATE.** It was placed at ~14:05Z against the ruled 12:00Z. The reboot fell between the push and the
packet. Under the ruling, Lane 1 would pin e0346d51; Chris has since relayed that Lane 1 is pinning fe4d787.

The packet is `invincible-agent/sessions/2026-10-30-packet-to-lane-01-from-cortex-case-panel-d1-d2-digest-4d6dd208-from-fe4d787.md`.

**Commits:**
- `c73c10d`: `offeredVerbs`, the task card's verb resolution, shared;
- `56fbec6`:
  - options absent on the case now read the pending task's own options;
  - the artifact opens through the BFF with the bearer;
- `c9fa491`: the request seal entry for `fetchCaseArtifact`;
- `fe4d787`: the panel subscribes to `byKind`, not to the stable `declarationFor` function.
  - The first mutant for this (`void byKind`) SURVIVED, because it was still a subscription.
  - The true pre-fix form went red.

**Gate** (CI layout, sibling = git-archive of `10ac02fe`): 4464 passed and 9 todo across 297 files; 445 cross-repo arms ran, 0
did not run, 0 missing. All seven steps exited 0.

## 2. Export picker against #154 (`e772cca`)

**What changed:**
- `FIXTURE_154_PROFILES` replaces the invented profiles with #154's two, `default-csv` and `default-json`, carrying
  their exact labels.
- `fixtureExportBody` is shaped like `to_csv` and `to_json`, including CRLF line endings and `column_map_version: 1`.
- `fetchIngestExportProfiles` now goes through `request("GET /ingest/export/profiles")`, and its `NO_READER` entry is
  gone.
- The "PROPOSED" wording on routes 1-3 now reads "declared at invincible-agent 10ac02fe (#154)".

| | |
|---|---|
| sha | `e772cca3367ec8302e3ee25b74a6149ae1d83313` (push fe4d787..e772cca) |
| CI run | `41069515784`: success, "Build and push frontend image (multi-arch)" ran |
| digest | `sha256:a31494f1978bb9927e642b519053f9ea25a02e4dbcd40d89c2cb5d658da5a121`, an OCI index |
| controls | `fe4d7879…` (full sha) still returns `4d6dd208…`; `0fd6d6d57b5f…` (docs-only) returns 404 |

This is the last image-bearing sha. 0fd6d6d is docs only, so the gate builds no image for it. Its run
(`41069979317`) was still in progress when I read the 404, so that 404 is not yet a proven "skipped".

**Nobody needs to pin this one yet.** `reviewExport` stays off in the deployed flags, so the picker does not
draw.

**The seal** (`reviewExport154.test.ts`) checks the fixture against the sibling's `policy/exports/*.yaml`:
- field for field;
- `columns[].output` in order;
- the file count, so the cardinality is checked too.

**Gate** (CI layout at e772cca): 4476 passed and 9 todo across 299 files; 445 cross-repo arms ran, 0 did not run, 0 missing.
All seven steps exited 0, and the report's mtime was the run's own. The report shows both new files ran every arm
against the pinned sibling: 6 of 6 and 3 of 3.

**Mutants** (re-fired by me in the CI layout; the implementer's run was cut off by the reboot before it reported):

| mutant | result |
|---|---|
| (a) a third fixture profile | red: "producer at 10ac02f: expected 2 to be 3" (cardinality), plus the field-for-field arm |
| (b) one label character | red: the field-for-field arm only |
| (c) `NO_READER` restored beside `request()` | red: "every typed read has READERS or a NO_READER reason, and nothing stale is listed" |
| control, unmutated | 28 of 28 passed; files byte-identical to e772cca afterwards |

**Batch gate: NOT changed, and the gap is written down.**
- The cortex side: `canExportBatch` shows the batch control on `entitlements.groups` ∋ `alert-processors`.
- The producer side: it gates the batch on capability `ingest:exportBatch`. `/me/entitlements` carries neither
  `groups` nor capabilities.
- So the batch control never shows outside the mock. A `// GAP:` comment marks this. **The architect's to rule.**

**#148's shape:** a body containing a `granularity: "answer"` profile is refused by the reader, and the picker shows
its failure state. That is the right behaviour today. If #148's answer profiles ever share this route, it becomes a
contract change.

## 3. Card-declaration schema (`0fd6d6d`): `docs/specs/card-declaration.schema.json`

This is a document only, with no code change. It is the input to the OpenDDIL ADR.

**Structure:**
- The root is a card **contract** (an exported `*_CONTRACT`).
- `$defs/registrationRow` is the contract as sent on `POST /register_frontend_capabilities`.
- `$defs/archetypePackage` is the ADR-0055 package.
- `x-cortex-rules` lists the cross-field rules JSON Schema cannot hold, each naming the test that enforces it. One
  rule, `payload_key` ∈ `fields`, is enforced by nothing; it holds on 10 of 10.

**Measured, not transcribed.**
- A throwaway vitest probe read the live modules: 29 contracts in 28 files (115 fields), 49 registration rows and 10
  packages. The probe was deleted, and `src/` is clean.
- All 88 validate under ajv 8.18 (draft 2020-12).
- 18 negative controls are each refused on their intended rule (path and keyword printed).

**Two findings, recorded in the schema; no code was changed:**
- **`layout: "rows"`** (COMPETING_MEASURES) is outside cortex's own `FrontendCapability.layout` union. It reaches the
  wire through an `as` cast.
- **`consumer`** (1 row, CANVAS_SEED) is not a property of the producer's `FrontendCapability` at 10ac02fe.

**Two spellings for a field coexist:** the `encoding` form (47 fields) and the `type` form (68 fields). The ADR may
want to pick one.

## Open

- **"The plan-recipient rows per answer"** is NOT started. Its meaning is unresolved, and I am waiting on Chris.
  - Possibly related: fin's placed packet `invincible-agent/sessions/2026-10-30-packet-to-gov-and-architect-from-fin-148-moved-to-policy-exports-answers-out-of-151s-glob-is-that-wanted.md`.
- **The batch-export gate gap** (above): for the architect.
- **Lane 01's per-choice consequence literal (#51)** is still open.
