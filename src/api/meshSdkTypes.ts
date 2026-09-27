/**
 * THE TS MIRROR OF THE iagent-mesh-sdk MODELS CORTEX CONSUMES.
 *
 * Two SDKs describe one wire. The Python one (`iagent-mesh-sdk/iagent_mesh/`) is the source of
 * truth — every model here is pydantic there, with validators and docstrings this file cannot
 * carry. Cortex has no Python, so it reads the same wire through hand-written types, and a
 * hand-written mirror of a foreign model DRIFTS WITHOUT A SYMPTOM: nothing in either repo fails
 * when one side gains a field, promotes a `bool` to a tri-state, or turns an omitted key into a
 * null one. The reader just sees a wrong screen, or sees nothing where something arrived.
 *
 * So the mirror is SEALED against the Python declarations, in `meshSdkParity.test.ts`. That seal
 * reads `iagent_mesh/models.py` and `iagent_mesh/enumeration.py` where the sibling checkout
 * exists, and a committed snapshot of them (`meshSdkParity.json`) everywhere else — CI checks out
 * cortex alone, and a cross-repo-only seal would skip in the one place that gates a merge.
 *
 * ── THIS IS THE WIRE TYPE. IT IS NOT `cardExport.ts`'s `MethodBlock` ──────────────────────────
 *
 * `src/lib/cardExport.ts` declares a MethodBlock too, and the two must not be conflated: that one
 * is a DISPLAY type, stringified on purpose by `formatLeaf`, and it refuses a block with no inputs
 * because a finance row and an unbacked formula are the same object from in there (ruled
 * 2026-09-26). This one is what the producer SENDS. Sealing the display type against the Python
 * would assert that a type stringified by design equals one that must not be — so the parity seal
 * is keyed here, and the export's type stays a downstream projection of it. That is lane ca's
 * recommended reading in the 2026-09-26 packet §3, adopted.
 *
 * ── STATUS OF THE SOURCE: UNRELEASED ─────────────────────────────────────────────────────────
 *
 * These models are on SDK branch `lane/ca`. v0.9.4 is not cut, nothing is tagged, and no consumer
 * pins an SDK version, so the snapshot records a SHA rather than a version. A mirror of an
 * unreleased model is legitimate and is also the case where drift is FASTEST, which is why the
 * seal exists now rather than after a release.
 *
 * ── WHAT IS NOT SETTLED HERE, AND WHOSE IT IS ────────────────────────────────────────────────
 *
 * 1. `completeness` / `total_available` are fields of the ENUMERATION RESPONSE — what the ask
 *    builder's menu is built from. `CompetingMeasures` keeps the grandfathered
 *    `methods_compared` / `methods_answered` vocabulary "until completeness / total_available
 *    land", and they have NOT landed on the planning envelope or the projector's tuple. Mirroring
 *    them does not sunset that vocabulary: the sunset is waiting on a field on a DIFFERENT object,
 *    and whether anyone intends to put it there is the architect's to say, not this lane's.
 * 2. The producer refuses `bound is None` XOR `bound_defaulted is None` — a bound with no word on
 *    where it came from, or a flag with no bound. `MethodBlock` in the SDK does not enforce that
 *    pairing, so the SDK is LOOSER than the producer on one point and a mirror of the SDK alone
 *    cannot see it. Whether the pairing belongs in the model is a ruling for the architect; it is
 *    recorded here rather than invented, and no reader in cortex may assume it holds.
 * 3. Nothing ties the producer's `_method` dict (`cost_agent/measures.py`) to `MethodBlock` by
 *    test — the producer's seal is across engines, not against the SDK. That gap is the
 *    platform's, and this file cannot close it from here.
 */

/**
 * A method input's value, WITH ITS JSON TYPE KEPT.
 *
 * Python: `Union[bool, int, float, str]`. `int` and `float` are both `number` here and the
 * int-ness is not expressible in TS — that is a stated loss, not an oversight. What must NOT
 * happen is stringification: `true` is a boolean and `4` is a number, and a reader that receives
 * `"true"` cannot tell it from a producer that sent the word.
 */
export type MethodInputValue = boolean | number | string;

/** Python: `iagent_mesh/models.py :: MethodInput`. */
export interface WireMethodInput {
  /** Required, non-blank (validated there, unenforceable here). */
  name: string;
  value: MethodInputValue;
  /**
   * ⛔ `null` IS "NO UNIT STATED", NEVER "DIMENSIONLESS". An input the producer did not annotate
   * must not read as one it asserted to be unitless. Both `null` and ABSENT arrive: the SDK dumps
   * `"unit": null`, and the producer's own dict may omit the key, and they are the same state.
   * A blank string is refused upstream — it is neither.
   */
  unit?: string | null;
}

/** Python: `iagent_mesh/models.py :: MethodBlock`. */
export interface WireMethodBlock {
  /** Required, non-blank. A figure with no formula is a claim nobody can re-derive. */
  formula: string;
  /**
   * A LIST of named inputs. The bare-name `list[str]` form is refused upstream, and so is the
   * `{name: value}` MAP form — `cardExport.ts`'s reader accepts the map as a second shape, which
   * is a place this side is more permissive than the wire, recorded and not silently narrowed.
   * An EMPTY list is a valid block in Python.
   */
  inputs: WireMethodInput[];
  /** `null` = no bound. A float there; `number` here. */
  bound?: number | null;
  /**
   * ⛔ TRI-STATE, AND THE THIRD STATE IS THE POINT. `true` = the producer says the bound is its
   * own default; `false` = the producer says the caller chose it; `null`/absent = the producer did
   * not say. A `boolean` type here, or a `!!x` read anywhere downstream, turns "did not say" into
   * "the caller chose it" — an unmade claim rewritten as a claim.
   */
  bound_defaulted?: boolean | null;
  /** Required, non-blank. Which code produced the figure, so a reader can tell WHICH formula ran. */
  producer_sha: string;
}

/**
 * `ToolOutput.method`, as it appears ON THE WIRE.
 *
 * ⛔ OPTIONAL, NOT NULLABLE. Python has `Optional[MethodBlock] = None`, but the base's wrap
 * serializer POPS the key when it is unset — that is the additive guarantee: an output that sets
 * no method dumps byte-identically to what it dumped before the field existed. So a reader must
 * expect the key to be ABSENT and must not be written to expect `method: null`.
 */
export interface WireToolOutput {
  method?: WireMethodBlock;
}

/** Python: `iagent_mesh/enumeration.py :: InstanceOption`. */
export interface WireInstanceOption {
  /** The identity, which is what round-trips the pick. */
  uri: string;
  /** What a person reads. Both, because a menu of URIs is unusable and labels cannot round-trip. */
  label: string;
}

/**
 * ⛔ THREE STATES, NEVER A BOOLEAN. `"unknown"` is the default and means the provider has not said
 * either way; it is not `"complete"` and not `"truncated"`. A boolean folds two of the three, and
 * the one it folds away is the honest under-claim — 0 of 5 providers emit this field today, so
 * every unmigrated provider is `"unknown"` and would collapse into whichever end a boolean chose.
 */
export type WireCompleteness = "complete" | "truncated" | "unknown";

/** Python: `iagent_mesh/enumeration.py :: EnumerateInstancesResponse`. */
export interface WireEnumerateInstancesResponse {
  instances: WireInstanceOption[];
  /**
   * WHICH bound slots the provider APPLIED, by name. Empty means class-wide. Names, not a boolean,
   * because a provider honouring one of two slots is neither scoped nor class-wide.
   */
  scoped_by: string[];
  completeness: WireCompleteness;
  /**
   * ⛔ `null` IS "NOT REPORTED", NEVER `0`. A provider that cannot count its own population must
   * not read as reporting an empty one. Unconstrained upstream: there is no non-negativity check
   * and no `total_available >= instances.length` check, so no reader here may assume either.
   */
  total_available: number | null;
}

/**
 * ── THE COMPILER'S HALF OF THE SEAL ──────────────────────────────────────────────────────────
 *
 * The parity test reads source and JSON; it cannot read a TS type, which is erased. These
 * assertions are the part `tsc` enforces, and they are aimed at the four mistakes the packet says
 * a mirror is most likely to make — each of which is a WRONG SCREEN rather than an error:
 * a folded three-state, a flattened tri-state, a stringified value, a nullable optional.
 *
 * `Exactly<A, B>` is mutually assignable in both directions, so a WIDER type fails as well as a
 * narrower one. `boolean` extends nothing useful here; `"complete" | "truncated"` would pass a
 * one-way `extends` check and fails this one.
 */
type Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type Assert<T extends true> = T;

export type _completeness_is_three_states = Assert<
  Exactly<WireCompleteness, "complete" | "truncated" | "unknown">
>;
/**
 * ⛔ THIS ASSERTION USED TO BE HOLLOW AND A MUTANT SAID SO. It read
 * `Exactly<NonNullable<X> | null | undefined, boolean | null | undefined>`, which ADDS BACK the two
 * members it had just stripped — so it could only ever check that the base type was `boolean`, and
 * `bound_defaulted: boolean` (required, non-nullable, the tri-state collapsed to two) passed it.
 * The tell was a mutant surviving on a GREEN baseline; on the earlier red one it had "failed" and
 * looked indicted, which is a redproof exiting 1 for the wrong reason and measuring nothing.
 *
 * Split into the three separate claims, the same way `method` already was.
 */
export type _bound_defaulted_is_boolean = Assert<
  Exactly<NonNullable<WireMethodBlock["bound_defaulted"]>, boolean>
>;
export type _bound_defaulted_may_be_absent = Assert<
  Exactly<undefined extends WireMethodBlock["bound_defaulted"] ? true : false, true>
>;
export type _bound_defaulted_may_be_null = Assert<
  Exactly<null extends WireMethodBlock["bound_defaulted"] ? true : false, true>
>;
export type _input_value_keeps_its_type = Assert<
  Exactly<WireMethodInput["value"], boolean | number | string>
>;
export type _total_available_is_number_or_null = Assert<
  Exactly<WireEnumerateInstancesResponse["total_available"], number | null>
>;
/**
 * `method` is OPTIONAL and NOT nullable: `undefined` is in the type and `null` is not. Written as
 * two assertions because one of them alone passes for the wrong reason — a `| null` addition keeps
 * `undefined` assignable, and a required field keeps `null` out.
 */
export type _method_is_optional = Assert<Exactly<undefined extends WireToolOutput["method"] ? true : false, true>>;
export type _method_is_not_nullable = Assert<
  Exactly<null extends WireToolOutput["method"] ? true : false, false>
>;

/**
 * ── THE RUNTIME DESCRIPTOR THE PARITY SEAL COMPARES ──────────────────────────────────────────
 *
 * A TS interface is erased, so the seal cannot ask it anything. This table is what it reads, and
 * it is keyed by `keyof` each interface — so the COMPILER refuses a field described here that the
 * interface does not declare, and refuses a field the interface declares that is not described.
 * The key set therefore cannot drift from the types, which is the half a source-text scan would
 * get wrong. The type STRINGS are still a hand statement, which is why the assertions above exist
 * for the four that matter and why the interfaces sit directly beside them for a reader.
 *
 * `optional` means the KEY MAY BE ABSENT on the wire. `nullable` means the VALUE may be null.
 * They are separate because `method` is the first and not the second, and `total_available` is the
 * second and not the first — conflating them is how "not reported" becomes "not sent".
 */
export interface MirroredField {
  /** The TS type as written above, minus `| null` and minus optionality — those are their own flags. */
  ts: string;
  optional: boolean;
  nullable: boolean;
}

export const MIRRORED_FIELDS = {
  MethodInput: {
    name: { ts: "string", optional: false, nullable: false },
    value: { ts: "boolean | number | string", optional: false, nullable: false },
    unit: { ts: "string", optional: true, nullable: true },
  },
  MethodBlock: {
    formula: { ts: "string", optional: false, nullable: false },
    inputs: { ts: "WireMethodInput[]", optional: false, nullable: false },
    bound: { ts: "number", optional: true, nullable: true },
    bound_defaulted: { ts: "boolean", optional: true, nullable: true },
    producer_sha: { ts: "string", optional: false, nullable: false },
  },
  ToolOutput: {
    // Optional and NOT nullable — the serializer pops the key. See `WireToolOutput`.
    method: { ts: "WireMethodBlock", optional: true, nullable: false },
  },
  InstanceOption: {
    uri: { ts: "string", optional: false, nullable: false },
    label: { ts: "string", optional: false, nullable: false },
  },
  EnumerateInstancesResponse: {
    instances: { ts: "WireInstanceOption[]", optional: false, nullable: false },
    scoped_by: { ts: "string[]", optional: false, nullable: false },
    completeness: { ts: '"complete" | "truncated" | "unknown"', optional: false, nullable: false },
    // Nullable but NOT optional: the key always arrives, and `null` means "not reported".
    total_available: { ts: "number", optional: false, nullable: true },
  },
} as const satisfies {
  MethodInput: Record<keyof WireMethodInput, MirroredField>;
  MethodBlock: Record<keyof WireMethodBlock, MirroredField>;
  ToolOutput: Record<keyof WireToolOutput, MirroredField>;
  InstanceOption: Record<keyof WireInstanceOption, MirroredField>;
  EnumerateInstancesResponse: Record<keyof WireEnumerateInstancesResponse, MirroredField>;
};

/**
 * ── AND THE FLAGS ARE TIED TO THE TYPES FOR EVERY FIELD, NOT THE FEW I THOUGHT OF ─────────────
 *
 * `satisfies` above already forces the KEY SETS to agree. What it cannot do is stop the descriptor
 * from SAYING `optional: true` about a field the interface declares as required — and a mutant
 * found that hole by collapsing `bound_defaulted?: boolean | null` to `boolean` while its
 * descriptor row went on claiming both flags, with nothing red anywhere.
 *
 * Six hand-written assertions covered six fields out of fifteen. This covers all fifteen, because
 * the thing worth sealing is the POPULATION and not the members I happened to suspect: a field
 * added tomorrow is checked by construction rather than waiting for someone to remember.
 *
 * The `ts` STRING still cannot be compared to a type — TS has no reflection over type names — so
 * that column remains a hand statement, checked against the Python by the parity seal and kept
 * beside the interfaces for a reader. Optionality and nullability ARE structural, so they are
 * checked here, and those are the two the packet warns are easy to conflate.
 */
type IsOptional<T, K extends keyof T> = undefined extends T[K] ? true : false;
type IsNullable<T, K extends keyof T> = null extends T[K] ? true : false;

/** `true` when every field's declared flags match the interface, else a union naming the culprits. */
type FlagsAgree<T, D extends Record<keyof T, { optional: boolean; nullable: boolean }>> = {
  [K in keyof T]-?: Exactly<D[K]["optional"], IsOptional<T, K>> extends true
    ? Exactly<D[K]["nullable"], IsNullable<T, K>> extends true
      ? true
      : ["nullable disagrees with the interface at", K]
    : ["optional disagrees with the interface at", K];
}[keyof T];

export type _method_input_flags = Assert<
  Exactly<FlagsAgree<WireMethodInput, typeof MIRRORED_FIELDS.MethodInput>, true>
>;
export type _method_block_flags = Assert<
  Exactly<FlagsAgree<WireMethodBlock, typeof MIRRORED_FIELDS.MethodBlock>, true>
>;
export type _tool_output_flags = Assert<
  Exactly<FlagsAgree<WireToolOutput, typeof MIRRORED_FIELDS.ToolOutput>, true>
>;
export type _instance_option_flags = Assert<
  Exactly<FlagsAgree<WireInstanceOption, typeof MIRRORED_FIELDS.InstanceOption>, true>
>;
export type _enumerate_response_flags = Assert<
  Exactly<FlagsAgree<WireEnumerateInstancesResponse, typeof MIRRORED_FIELDS.EnumerateInstancesResponse>, true>
>;
