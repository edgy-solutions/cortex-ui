/**
 * EXPORT A DRAWN CARD AS ONE SELF-CONTAINED HTML FILE.
 *
 * ── WHAT THIS IS FOR ──────────────────────────────────────────────────────────────────────
 *
 * A card on the canvas is an answer someone can act on, and carrying it out of this app has
 * until now been a screenshot. A screenshot loses the two things that make the answer
 * defensible: the values BEFORE the card formatted them, and the account of where they came
 * from. This module writes a file carrying four sections, in this order:
 *
 *   1. THE CARD AS RENDERED    — the live DOM, verbatim, with the page's own CSS inlined.
 *   2. THE FULL PAYLOAD        — every leaf value, at its path, UNFORMATTED.
 *   3. THE PRODUCER'S METHOD   — formula, inputs (with units), bound, bound_defaulted,
 *                                producer_sha. Or the sentence. See below.
 *   4. PROVENANCE              — persona, verb, engine, roll sha, timestamp, question asked.
 *
 * Section 2 exists BECAUSE of section 1, not beside it. The card formats for a reader:
 * `-800000` draws as `-800,000`, `0.62` draws as `62%`. Both are right for a card and neither
 * is the value. An export whose only numbers are the drawn ones cannot be checked against the
 * producer, so the payload table renders leaves through `String(v)` and nothing else. That is
 * what "contains every payload value verbatim" means here, and it is sealed by flattening the
 * payload a second time and comparing PATH AND VALUE PAIRWISE WITH A COUNT — because a
 * containment assertion cannot see a value that went missing or one that crept in.
 *
 * ── ABSENCE IS RENDERED, NEVER FILLED ─────────────────────────────────────────────────────
 *
 * `method` is not on the wire yet — it appears nowhere in `src/api/types.ts` and in none of the
 * captured payloads under `sessions/`. It is expected from the worker, and until it arrives the
 * only honest thing to draw is a sentence saying it was not supplied. So:
 *
 *   - `readMethod` returns null for anything that is not a method block, and a block with NO
 *     FORMULA is dropped WHOLE. The formula is the claim; inputs and a bound are its colour,
 *     and a "method" that cannot state how it computed is a blank wearing a heading. Same rule
 *     `readPresentation` applies to `selection_basis`, for the same reason.
 *   - When it is null the renderer emits `METHOD_ABSENT_SENTENCE`. Not an empty section, not a
 *     dash, not an em-space — a sentence a reader can act on, because a blank section is
 *     indistinguishable from a section that failed to render.
 *
 * NOTHING HERE DERIVES A METHOD. No formula is reconstructed from the rows, no bound is
 * inferred from a threshold. An invented method is worse than an absent one: the absent one is
 * visibly absent, and the invented one is evidence that never existed.
 *
 * The same discipline covers provenance, which is MOSTLY ABSENT TODAY and will look empty on
 * real artifacts for a while. `roll sha` in particular has no field of its own on the wire —
 * `fleet_sha`/`repo_sha` live on the session capture WRAPPER, not on the artifact — so it is
 * read from `produced_by.code_hash` and rendered absent when that is missing. Every provenance
 * line renders either a captured value or the word absent, and a reader can tell which.
 *
 * ── SELF-CONTAINED MEANS NO NETWORK ───────────────────────────────────────────────────────
 *
 * The file opens with no server, so there is no external stylesheet, no font URL, no script.
 * The page's CSS is passed in as text by the capture layer (`cardExportCapture.ts`) and
 * inlined; when it cannot be read the card region still renders, unstyled, and says so rather
 * than looking broken. `<script>` is stripped from the captured markup on the way in — our own
 * card has none, and a file that executes what it captured is a different kind of artifact
 * than this one.
 */

// A TYPE-ONLY import, so nothing about `src/api` reaches this module at runtime — the whole file is
// still a leaf. It is imported rather than restated because `MethodInputValue` is the wire's union
// and a second copy of a union is a second thing to keep in step. See `meshSdkTypes.ts`, which
// carries the reason the union must not be flattened to `string`.
import type { MethodInputValue, WireMethodBlock } from "@/api/meshSdkTypes";

/** The exact words drawn where a method block would be, when the producer supplied none. */
export const METHOD_ABSENT_SENTENCE = "method not supplied";

/** Drawn for any single provenance line the artifact did not carry. */
export const ABSENT_MARK = "absent";

/** Drawn where a tri-state flag's third state is the answer: the producer did not say. */
export const NOT_STATED_MARK = "not stated";

/**
 * One named input to a formula, as the producer states it. Both sides verbatim.
 *
 * ⛔ `value` KEEPS ITS JSON TYPE (ordered 2026-09-27, from ca's packet of 2026-09-26). It used to
 * be `string`, stringified by `formatLeaf` in the reader, and that is precisely the loss
 * `meshSdkTypes.ts` names: "a reader that receives `"true"` cannot tell it from a producer that
 * sent the word." Formatting now happens at the RENDER edge, where it belongs, and this type is
 * `MethodInputValue` — the same union the wire mirror declares, imported rather than restated so
 * the two cannot drift apart by being written twice.
 */
export interface MethodInput {
  name: string;
  /**
   * The producer's scalar, by identity. A value that is NOT a JSON scalar is off contract; it is
   * kept as its `formatLeaf` text rather than dropped, because an input the reader cannot type is
   * still an input the reader must be able to see. A MISSING value reads as the distinct text
   * `"undefined"` for the same reason — see `formatLeaf`.
   */
  value: MethodInputValue;
  /**
   * ⛔ `null` IS "NO UNIT STATED", NEVER "DIMENSIONLESS", and never dropped. Mirrors
   * `WireMethodInput.unit`: both an explicit `null` and an absent key arrive and are the same
   * state, so both read as `null` here. Blank reads as `null` too — a blank unit is neither state,
   * and this side must not invent a third.
   */
  unit: string | null;
}

/**
 * The producer's account of how it computed the figures on the card.
 *
 * `formula` is required — see the header. Every other field is nullable because this is a
 * DISPLAY type read from a possibly-off-contract producer, not the wire contract: the wire's
 * `producer_sha` is required and non-blank, and a block that omits it is still a block worth
 * drawing with the omission visible. That asymmetry is deliberate — refusing the block would
 * hide the formula to punish a missing provenance line.
 *
 * ⛔ THE FIELD TYPES ARE THE WIRE'S, NOT A REFORMATTING OF THEM. `bound` is a number, so a bound
 * of `0` is a bound and not a blank; `bound_defaulted` is a strict TRI-STATE, so "the producer did
 * not say" cannot be read as "the caller chose it". See `WireMethodBlock` for what each state means
 * upstream — this type exists to carry those states through, not to collapse them.
 *
 * ⚠ AND THE PAIR IS NOW ENFORCED UPSTREAM, WHICH DOES NOT MAKE THIS READER'S BRANCHES DEAD. As of
 * 2026-09-27 the mesh SDK carries a `model_validator` requiring `(bound is None) ==
 * (bound_defaulted is None)` — so "a flag with no bound" and "a bound with no flag" are refused at
 * the producer rather than merely discouraged, which answers the XOR question this lane had open
 * from the packet. The reader still reads the two independently, on purpose: the combinations the
 * validator forbids are exactly what an OFF-CONTRACT or older producer emits, and a reader that
 * assumed the pair agreed would draw a confident half-statement instead of showing the halves. The
 * branch arms covering those combinations are claims about this reader, NOT about what the wire may
 * carry. ⚠ The mirror does not know about the validator yet: `meshSdkParity.json` pins
 * `b0abd3b7`, which predates it. Whoever bumps that pin re-extracts, and that is when the XOR can
 * become a seal here rather than a sentence.
 *
 * ⚠ THE FIELD NAMES ARE THE WIRE'S TOO, DELIBERATELY — `bound_defaulted`, not `boundDefaulted`,
 * against this file's own TS habit. A camelCase rename would force the seal on "which wire fields
 * survive the reader" to carry a hand-written wire→display mapping, and a hand-written list is a
 * population that cannot notice a field the wire GAINS. Spelled the wire's way, the census is
 * `keyof WireMethodBlock` against the read block and needs no list. `boundUnreadable` is the one
 * field with no wire counterpart and is camelCase on purpose, so the census subtracts exactly the
 * thing that is ours.
 */
export interface MethodBlock {
  formula: string;
  inputs: MethodInput[];
  /** `null` = the producer stated no bound. A numeric `0` is a STATED bound, not an absence. */
  bound: number | null;
  /**
   * The verbatim text of a bound that was PRESENT but did not read as a number — off contract
   * upstream (`Optional[float]`), and therefore exactly the case that must not disappear. `null`
   * when `bound` read cleanly or when the producer stated none, so "stated nothing" and "stated
   * something unreadable" stay distinguishable at the render edge.
   */
  boundUnreadable: string | null;
  /** `true` = the producer's own default · `false` = the caller chose it · `null` = did not say. */
  bound_defaulted: boolean | null;
  /** Which code produced the figure. `null` = the producer sent none; never a blank. */
  producer_sha: string | null;
}

type _Exactly<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type _Assert<T extends true> = T;

/**
 * ⛔ THE CENSUS OF WHAT THE READER CARRIES, AT COMPILE TIME, KEYED ON THE WIRE.
 *
 * The population is `keyof WireMethodBlock` — not a list written here, which is the shape that
 * cannot notice a field the wire GAINS. Add `unit_system` upstream and this goes red the next time
 * anything type-checks; hand-pick five names instead and it stays green forever.
 *
 * Read as: no wire field is missing from the display block (first), and the display block invents
 * exactly one field of its own (second, and it is named, so a silent sixth cannot hide behind a
 * `never`). Both directions, because "the reader dropped one" and "the reader grew one nobody
 * declared" are different defects and one assertion sees only the first.
 */
export type _reader_carries_every_wire_field = _Assert<
  _Exactly<Exclude<keyof WireMethodBlock, keyof MethodBlock>, never>
>;
export type _reader_adds_only_boundUnreadable = _Assert<
  _Exactly<Exclude<keyof MethodBlock, keyof WireMethodBlock>, "boundUnreadable">
>;

/** One leaf of the payload, at its path, formatted by nothing. */
export interface PayloadCell {
  path: string;
  value: string;
}

/** The six provenance facts the export carries. Null means the artifact did not carry it. */
export interface ExportProvenance {
  persona: string | null;
  verb: string | null;
  engine: string | null;
  roll_sha: string | null;
  timestamp: string | null;
  question_asked: string | null;
}

export interface CardExportInput {
  /** The card's own title, for the document title and the first heading. */
  title: string;
  /** The producer's archetype, verbatim, or null if it declared none. */
  archetype: string | null;
  /** The live card's `outerHTML`, or null when the capture could not read it. */
  cardHtml: string | null;
  /** The page's CSS as text, or null — the card region then renders unstyled and says so. */
  css: string | null;
  /** The payload as the producer sent it. Flattened whole; nothing is skipped. */
  payload: unknown;
  /** The producer's method block, or null. Null draws `METHOD_ABSENT_SENTENCE`. */
  method: MethodBlock | null;
  provenance: ExportProvenance;
  /** When the export was taken. The client's clock, and labelled as the client's clock. */
  exportedAt: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** A trimmed string, or null. Used for every provenance line, so "" and absent read alike. */
export function orNull(v: unknown): string | null {
  const s = str(v);
  return s === "" ? null : s;
}

/**
 * One leaf, as text, formatted by nothing.
 *
 * `String(v)` and not `toLocaleString`, not `toFixed`, not a percent. The card is where a
 * number becomes readable; this is where it stays checkable. `null` and `undefined` are
 * DISTINCT and both are rendered, because "the producer sent null" and "the producer sent no
 * such key" are different facts and a table that prints both as blank has lost the one that
 * matters.
 */
export function formatLeaf(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "bigint") return String(v);
  return JSON.stringify(v) ?? String(v);
}

/**
 * One input's value, WITH ITS JSON TYPE INTACT.
 *
 * A scalar passes through by identity — that is the whole change, and `4` staying a number is what
 * lets the render edge tell it from a producer that sent `"4"`. Anything else (an object, an array,
 * `null`, a missing key) is off contract and becomes its `formatLeaf` text, because the type union
 * cannot hold it and dropping it would lose an input the reader is entitled to see. `formatLeaf`
 * spells `null` and `undefined` DISTINCTLY, so "the producer sent null" and "the producer sent no
 * value" survive as different cells.
 */
function readInputValue(v: unknown): MethodInputValue {
  if (typeof v === "boolean" || typeof v === "number" || typeof v === "string") return v;
  return formatLeaf(v);
}

/**
 * The bound, as a number, and the text of one that could not be read as a number.
 *
 * ⛔ `0` IS A BOUND. Every spelling that tests the bound for truthiness — here, or at the render
 * edge — turns a threshold of zero into "the producer stated none", and a zero threshold is a
 * perfectly ordinary one (`contribution >= 0`). The test is `=== null`, and the guard against a
 * `NaN` sneaking through as a "number" is explicit rather than implied.
 *
 * A NUMERIC STRING is accepted and converted: `"0.25"` and `0.25` are the same value, and the
 * producer narrowed to a float only recently. Anything else present — a SENTENCE bound such as
 * `"|contribution| >= 100000"`, which is what this repo's own fixture carried before the narrowing
 * — is off contract and is returned as `boundUnreadable`, NOT as `null`. Nulling it would render as
 * "absent" and tell the reader the producer stated no bound when it stated one this side could not
 * parse, which is the absent-vs-unreadable confusion, on the field where it costs the most.
 */
function readBound(raw: unknown): { bound: number | null; boundUnreadable: string | null } {
  if (raw === null || raw === undefined) return { bound: null, boundUnreadable: null };
  if (typeof raw === "number") {
    return Number.isFinite(raw)
      ? { bound: raw, boundUnreadable: null }
      : { bound: null, boundUnreadable: formatLeaf(raw) };
  }
  if (typeof raw === "string") {
    // A BLANK bound is not an unreadable one — there is nothing in it to fail to read, and
    // carrying `""` through as `boundUnreadable` would draw an empty strong tag where the absent
    // mark belongs. Blank and absent are the same state, as everywhere else in this file.
    if (raw.trim() === "") return { bound: null, boundUnreadable: null };
    const n = Number(raw);
    if (Number.isFinite(n)) return { bound: n, boundUnreadable: null };
  }
  return { bound: null, boundUnreadable: formatLeaf(raw) };
}

/**
 * The producer's sha, or none. Blank and absent are the same state; a present non-string is off
 * contract (`producer_sha` is required and non-blank upstream) and is shown as its text rather than
 * nulled, because "the producer sent nothing" and "the producer sent something odd" are the pair
 * this file refuses to collapse.
 */
function readProducerSha(v: unknown): string | null {
  if (typeof v === "string") return orNull(v);
  if (v === null || v === undefined) return null;
  return formatLeaf(v);
}

/**
 * Read the producer's method block, or nothing.
 *
 * Dropped whole when there is no formula, AND when nothing names an input — see the ruling at
 * the second guard, which is what stops a data row reading as provenance. `inputs` entries with no name are dropped
 * individually — a row that cannot say which input it is cannot be checked against anything —
 * but a value of `0` or `false` or `""` is KEPT, because those are answers and the
 * absent-vs-falsy confusion is exactly how a zero becomes a blank. Only the name gates a row.
 */
export function readMethod(raw: unknown): MethodBlock | null {
  if (!isRecord(raw)) return null;
  const formula = str(raw.formula);
  if (!formula) return null;

  const inputs: MethodInput[] = [];
  if (Array.isArray(raw.inputs)) {
    for (const i of raw.inputs) {
      if (!isRecord(i)) continue;
      const name = str(i.name);
      if (!name) continue;
      inputs.push({ name, value: readInputValue(i.value), unit: orNull(i.unit) });
    }
  } else if (isRecord(raw.inputs)) {
    // The producer may send inputs as `{name: value}`. Both shapes read to the same pairs;
    // neither is preferred, because guessing which one is canonical is how one of them
    // silently renders as nothing.
    for (const name of Object.keys(raw.inputs)) {
      if (!name.trim()) continue;
      // The map shape has nowhere to PUT a unit — `{name: value}` carries a value and nothing
      // else — so `unit` is null here by construction and not by a reading. That is a real
      // difference between the two accepted shapes, recorded rather than papered over: a producer
      // that needs to state units cannot use the map form.
      inputs.push({ name: name.trim(), value: readInputValue(raw.inputs[name]), unit: null });
    }
  }

  // ⛔ A ROW IS NOT A BLOCK, AND THE INPUTS ARE THE ONLY THING THAT SEPARATES THEM. Ruled
  // 2026-09-26 (arch, the decoupled half of the `method_label` ruling): a row must never yield a
  // method block. MEASURED before it was ruled, in `projectedTupleParity.test.ts` — a finance row
  // carries `formula: "EAC = BAC / CPI"` beside a row-level `method: "CPI"` and no inputs at all,
  // so a non-empty formula being the ONLY requirement made every row read as a valid block whose
  // provenance was silently empty, under a heading telling the reader the producer had accounted
  // for its own arithmetic.
  //
  // The requirement is keyed on what a method block IS — a formula TOGETHER WITH the inputs it
  // was computed from — and not on what a row looks like. That distinction is the whole reason
  // this is now takeable: the seal that measured the defect declined the other candidate fix,
  // rejecting row-SHAPED input, because "a row could legitimately grow a field a block also has,
  // and then the reader would be guessing." That objection holds against a blacklist and does not
  // touch a positive requirement, which counts every unknown shape as not-a-block by default.
  //
  // ⚠ IT ALSO REFUSES A FORMULA WITH NOTHING BEHIND IT, and that is the price rather than a side
  // effect: such a block and a finance row are the same object seen from in here, so no rule
  // refuses one and accepts the other without keying on row spelling. An unbacked formula drawn
  // under a provenance heading is the invented method the docstring above forbids;
  // METHOD_ABSENT_SENTENCE is the honest output for it. The RENDERER still handles an
  // empty-inputs block, which is now only constructible by hand — sealed as such.
  if (inputs.length === 0) return null;

  const { bound, boundUnreadable } = readBound(raw.bound);

  return {
    formula,
    inputs,
    bound,
    boundUnreadable,
    // ⛔ NO `!!` AND NO `Boolean(...)`, EVER, ON A TRI-STATE. A coercion here reads "the producer
    // did not say" as `false`, which upstream means "the caller chose this bound" — an unmade
    // claim rewritten as a claim, about the one fact that says whose number 0.25 is. Only a real
    // boolean is a statement; anything else, including a string `"true"`, is not one.
    bound_defaulted: typeof raw.bound_defaulted === "boolean" ? raw.bound_defaulted : null,
    producer_sha: readProducerSha(raw.producer_sha),
  };
}

/**
 * The three states a CARD (not the export) must tell apart when it looks for a method block.
 *
 * `MethodBlock | null` collapses two different facts into one `null`: "nobody sent a `method`
 * key" and "a `method` key arrived and `readMethod` refused it". The export can afford that
 * collapse — both draw `METHOD_ABSENT_SENTENCE` there — but a reader who sent SOMETHING under
 * `method` and sees nothing render needs to be told it arrived and could not be read, not told
 * the producer said nothing. So the card's own reader (`readArtifactMethod`) keeps the two
 * apart and this is the type that carries the distinction past the point where `MethodBlock |
 * null` would have erased it again.
 */
export type ArtifactMethod =
  | { state: "present"; block: MethodBlock; level: "component" | "envelope" }
  /** A `method` KEY was sent at this level and `readMethod` refused it. Never "absent". */
  | { state: "unreadable"; level: "component" | "envelope" }
  /** No `method` key at either level — the producer stated none. */
  | { state: "absent" };

/** One level's reading: whether a `method` key was there, and if so whether it read. */
function readLevel(
  obj: unknown,
): { state: "present"; block: MethodBlock } | { state: "unreadable" } | { state: "absent" } {
  // Gate on the KEY, not on truthiness — `method: {}` is a key the producer sent, and it must
  // read as "unreadable", never as "absent", even though `{}` and "no key" are equally falsy.
  if (!isRecord(obj) || !("method" in obj)) return { state: "absent" };
  const block = readMethod(obj.method);
  return block ? { state: "present", block } : { state: "unreadable" };
}

/**
 * Where a card looks for its method block — the two levels `CardExportButton.tsx` read before it
 * retired (`dbf67f4`), kept in the same order: the component first, then the envelope.
 *
 * `components[0]` is read ONLY when there is exactly one component, as the retired reader's own
 * payload choice already implied (`components.length === 1 ? components[0] : components`) — a
 * multi-component answer has no single "the" component, and attributing one of several
 * components' method to the whole answer would be inventing an attribution, not reading one.
 * With zero or more-than-one components, the component level is "absent" by construction and
 * this falls straight through to the envelope.
 */
export function readArtifactMethod(components: unknown[], envelope: unknown): ArtifactMethod {
  const component = components.length === 1 ? readLevel(components[0]) : { state: "absent" as const };
  if (component.state === "present") {
    return { state: "present", block: component.block, level: "component" };
  }

  const atEnvelope = readLevel(envelope);

  // The component sent a `method` key this side could not read. Before reporting THAT, check
  // whether the envelope has a readable block of its own — a producer that could not shape the
  // component-level block may still have stated one at the envelope, and that one is drawable.
  // Only when the envelope has nothing either does the component's "unreadable" stand.
  if (component.state === "unreadable" && atEnvelope.state !== "present") {
    return { state: "unreadable", level: "component" };
  }

  if (atEnvelope.state === "present") return { state: "present", block: atEnvelope.block, level: "envelope" };
  if (atEnvelope.state === "unreadable") return { state: "unreadable", level: "envelope" };
  return { state: "absent" };
}

/**
 * Every leaf of the payload, at its dotted path, in document order.
 *
 * AN EMPTY OBJECT OR ARRAY IS ITSELF A LEAF. `rows: []` recurses into nothing, so a naive walk
 * emits no cell for it and the table silently loses the fact that the producer sent an empty
 * collection — which for this archetype is the difference between "no entity contributed" and
 * "the projector dropped the rows". It is emitted as `{}` / `[]` so the reader sees it.
 */
export function flattenPayload(payload: unknown, prefix = ""): PayloadCell[] {
  const out: PayloadCell[] = [];

  const walk = (v: unknown, path: string): void => {
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out.push({ path: path || "(root)", value: "[]" });
        return;
      }
      v.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (isRecord(v)) {
      const keys = Object.keys(v);
      if (keys.length === 0) {
        out.push({ path: path || "(root)", value: "{}" });
        return;
      }
      for (const k of keys) walk(v[k], path ? `${path}.${k}` : k);
      return;
    }
    out.push({ path: path || "(root)", value: formatLeaf(v) });
  };

  walk(payload, prefix);
  return out;
}

/** HTML-escape for text and attribute positions alike. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Remove anything executable from captured markup.
 *
 * Our own card carries no script, so in practice this removes nothing — it is here because the
 * input is "whatever was in the DOM" and an export that runs it is a different artifact than
 * one that records it. `<script>` with any attributes, and any `on*=` handler attribute.
 */
export function stripExecutable(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<script\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "")
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
}

/**
 * The export document's own chrome. Deliberately small, and every selector is `cx-`-prefixed so
 * inlining the app's stylesheet after it cannot be restyled BY it, and it cannot restyle the
 * captured card.
 */
const EXPORT_CSS = `
  :root { color-scheme: dark; }
  body.cx-export { margin: 0; background: #07090d; color: #e2e8f0;
    font: 13px/1.55 ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
  .cx-wrap { max-width: 1100px; margin: 0 auto; padding: 24px 16px 64px; }
  .cx-doc-title { font-size: 20px; font-weight: 600; margin: 0 0 4px; color: #e8f6ff; }
  .cx-doc-sub { margin: 0 0 24px; font-size: 11px; font-family: ui-monospace, monospace;
    color: #7c8da3; }
  .cx-section { margin: 0 0 32px; border: 1px solid #1d2733; border-radius: 8px;
    background: #0b0f15; }
  .cx-section > h2 { margin: 0; padding: 10px 14px; font-size: 11px; font-weight: 600;
    letter-spacing: .09em; text-transform: uppercase; color: #64d9ff;
    border-bottom: 1px solid #1d2733; }
  .cx-section > .cx-body { padding: 14px; }
  table.cx-table { width: 100%; border-collapse: collapse; font-family: ui-monospace, monospace;
    font-size: 12px; }
  table.cx-table th, table.cx-table td { text-align: left; padding: 4px 10px;
    border-bottom: 1px solid #161e29; vertical-align: top; }
  table.cx-table th { color: #7c8da3; font-weight: 600; font-size: 10px;
    letter-spacing: .06em; text-transform: uppercase; }
  table.cx-table td.cx-path { color: #9ab6d0; white-space: nowrap; }
  table.cx-table td.cx-value { color: #f1f6fb; word-break: break-word; }
  .cx-absent { font-style: italic; color: #f0a5a5; }
  .cx-note { margin: 10px 0 0; font-size: 11px; color: #7c8da3; }
  .cx-formula { margin: 0 0 12px; padding: 8px 10px; background: #0f151d;
    border: 1px solid #1d2733; border-radius: 6px;
    font-family: ui-monospace, monospace; font-size: 12px; color: #c9f5ff;
    word-break: break-word; }
  .cx-card-frame { padding: 14px; background: #0a0e14; border-radius: 6px; overflow: auto; }

  /* THE CANVAS'S POSITIONING SHELL IS NOT THE CARD, and it does not survive being lifted out of
     the canvas. A stage card's body wraps its content in \`absolute inset-0\` so the camera can
     place it, and the preview branch adds a FitBox \`scale()\` so the whole answer shrinks to card
     size. Inlined into a plain document both are wrong in the same way: the absolute child
     collapses out of flow inside a frame that has no height, and the scale renders a legible
     answer as a thumbnail. Neutralised on the OUTERMOST captured elements only — the card's own
     internal layout is untouched, because that IS the card as rendered. */
  .cx-card-frame > *, .cx-card-frame > * > * {
    position: static !important; inset: auto !important;
    transform: none !important; overflow: visible !important;
  }
`;

function section(heading: string, bodyHtml: string): string {
  return (
    `<section class="cx-section"><h2>${escapeHtml(heading)}</h2>` +
    `<div class="cx-body">${bodyHtml}</div></section>`
  );
}

function absentSpan(text: string): string {
  return `<span class="cx-absent">${escapeHtml(text)}</span>`;
}

/** Section 1 — the card as rendered, or an explicit account of why it is not here. */
function cardSection(input: CardExportInput): string {
  if (!input.cardHtml) {
    return section(
      "The card as rendered",
      `<p>${absentSpan("card markup was not captured")}</p>` +
        `<p class="cx-note">The payload below is unaffected: it comes from the artifact, not ` +
        `from the DOM.</p>`,
    );
  }
  const unstyled = input.css
    ? ""
    : `<p class="cx-note">The page stylesheet could not be read, so the card below is its ` +
      `markup without its styling. Its text and structure are verbatim.</p>`;
  return section(
    "The card as rendered",
    `<div class="cx-card-frame">${stripExecutable(input.cardHtml)}</div>${unstyled}`,
  );
}

/** Section 2 — every leaf, unformatted. The section the seal is written against. */
function payloadSection(input: CardExportInput): string {
  const cells = flattenPayload(input.payload);
  if (cells.length === 0) {
    return section("The full payload", `<p>${absentSpan("the artifact carried no payload")}</p>`);
  }
  const rows = cells
    .map(
      (c) =>
        `<tr><td class="cx-path" data-cx-path="${escapeHtml(c.path)}">${escapeHtml(c.path)}</td>` +
        `<td class="cx-value">${escapeHtml(c.value)}</td></tr>`,
    )
    .join("");
  return section(
    "The full payload",
    `<table class="cx-table" data-cx-payload-cells="${cells.length}">` +
      `<thead><tr><th>path</th><th>value</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="cx-note">Values are the producer's, through no formatter. The card above ` +
      `formats them for reading; these are the ones to check against the producer.</p>`,
  );
}

/** Section 3 — the method, or the sentence. Never a blank, never a reconstruction. */
function methodSection(input: CardExportInput): string {
  const m = input.method;
  if (!m) {
    return section(
      "How the producer computed this",
      `<p data-cx-method="absent">${absentSpan(METHOD_ABSENT_SENTENCE)}</p>` +
        `<p class="cx-note">Nothing here is derived from the rows. An absent method is ` +
        `recorded as absent.</p>`,
    );
  }
  const inputRows = m.inputs.length
    ? `<table class="cx-table"><thead><tr><th>input</th><th>value</th><th>unit</th>` +
      `</tr></thead><tbody>` +
      m.inputs
        .map(
          (i) =>
            `<tr><td class="cx-path">${escapeHtml(i.name)}</td>` +
            // `formatLeaf` at the RENDER edge, not in the reader. The block carries the producer's
            // scalar; this is the one place it becomes text, which is what keeps `4` and `"4"`
            // distinguishable everywhere upstream of here.
            `<td class="cx-value">${escapeHtml(formatLeaf(i.value))}</td>` +
            // ⛔ THE UNIT COLUMN IS DRAWN EVEN WHEN NO INPUT HAS ONE, and an unstated unit gets
            // the absent mark rather than a blank cell. A blank says nothing about whether the
            // producer declined to annotate the input or this side lost the annotation, and this
            // side did lose it until 2026-09-27. `null` is "no unit STATED" and never
            // "dimensionless" — the mark reads as the former.
            `<td class="cx-value">` +
            (i.unit === null ? absentSpan(ABSENT_MARK) : escapeHtml(i.unit)) +
            `</td></tr>`,
        )
        .join("") +
      `</tbody></table>`
    : `<p>inputs: ${absentSpan(ABSENT_MARK)}</p>`;
  // ⛔ `=== null`, NOT TRUTHINESS. `m.bound ? ... : absent` drew a bound of `0` as "absent" — the
  // producer states a threshold of zero and the page said it stated none. A zero threshold is
  // ordinary, so this was not a corner: it was the field's own cheapest value rendering as its
  // opposite. The unreadable case is a THIRD branch, because a bound the producer stated and this
  // side could not parse must not read as one it never stated.
  const bound =
    m.bound !== null
      ? `<p class="cx-note">bound: <strong>${escapeHtml(formatLeaf(m.bound))}</strong></p>`
      : m.boundUnreadable !== null
        ? `<p class="cx-note">bound: <strong>${escapeHtml(m.boundUnreadable)}</strong> ` +
          absentSpan("(not a number — stated by the producer, unparsed here)") + `</p>`
        : `<p class="cx-note">bound: ${absentSpan(ABSENT_MARK)}</p>`;
  // THREE BRANCHES FOR THREE STATES. The third is not a fallback: "the producer did not say whose
  // bound this is" is an answer a reader recomputing the formula needs, and it is the answer a
  // `!!` would have destroyed on the way in.
  const defaulted =
    m.bound_defaulted === null
      ? `<p class="cx-note">bound_defaulted: ${absentSpan(NOT_STATED_MARK)}</p>`
      : `<p class="cx-note">bound_defaulted: <strong>${m.bound_defaulted}</strong> ` +
        `<span class="cx-note">(${
          m.bound_defaulted ? "the producer's own default" : "chosen by the caller"
        })</span></p>`;
  const sha =
    m.producer_sha === null
      ? `<p class="cx-note">producer_sha: ${absentSpan(ABSENT_MARK)}</p>`
      : `<p class="cx-note">producer_sha: <strong>${escapeHtml(m.producer_sha)}</strong></p>`;
  return section(
    "How the producer computed this",
    `<div data-cx-method="present">` +
      `<p class="cx-formula">${escapeHtml(m.formula)}</p>${inputRows}${bound}${defaulted}${sha}` +
      `</div>`,
  );
}

/** Section 4 — the six facts, each either captured or visibly absent. */
function provenanceSection(input: CardExportInput): string {
  const p = input.provenance;
  const lines: [string, string | null][] = [
    ["persona", p.persona],
    ["verb", p.verb],
    ["engine", p.engine],
    ["roll sha", p.roll_sha],
    ["timestamp", p.timestamp],
    ["question asked", p.question_asked],
  ];
  const rows = lines
    .map(
      ([label, value]) =>
        `<tr><td class="cx-path">${escapeHtml(label)}</td>` +
        `<td class="cx-value" data-cx-prov="${escapeHtml(label)}">` +
        (value ? escapeHtml(value) : absentSpan(ABSENT_MARK)) +
        `</td></tr>`,
    )
    .join("");
  return section(
    "Provenance",
    `<table class="cx-table"><tbody>${rows}</tbody></table>` +
      `<p class="cx-note">Absent lines are fields this artifact did not carry. ` +
      `<code>roll sha</code> is read from <code>produced_by.code_hash</code>; the wire has no ` +
      `roll-sha field of its own.</p>`,
  );
}

/**
 * Build the whole file.
 *
 * Pure: same input, same string. Every byte of the output is decided here, which is what lets
 * the seals read the document instead of the screen.
 */
export function buildCardExportHtml(input: CardExportInput): string {
  const archetype = input.archetype ? input.archetype : ABSENT_MARK;
  const pageCss = input.css
    ? `\n/* ── the app's own stylesheet, inlined ── */\n${input.css}\n`
    : "";
  return (
    `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n` +
    `<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<title>${escapeHtml(input.title)}</title>\n` +
    `<style>${EXPORT_CSS}${pageCss}</style>\n</head>\n` +
    `<body class="cx-export">\n<div class="cx-wrap">\n` +
    `<h1 class="cx-doc-title">${escapeHtml(input.title)}</h1>\n` +
    `<p class="cx-doc-sub">archetype ${escapeHtml(archetype)} · exported ` +
    `${escapeHtml(input.exportedAt)} (this browser's clock)</p>\n` +
    cardSection(input) +
    "\n" +
    payloadSection(input) +
    "\n" +
    methodSection(input) +
    "\n" +
    provenanceSection(input) +
    `\n</div>\n</body>\n</html>\n`
  );
}

/**
 * Read the six provenance facts off an artifact.
 *
 * ── EVERY FALLBACK HERE IS NAMED, AND THERE ARE ONLY THREE ────────────────────────────────
 *
 * A long `??` chain is how a field ends up misattributed: the export says "persona: X" and the
 * reader cannot tell whether X was the entitled user's persona, the verb's owning persona, or
 * the persona the request acted as — three different facts that happen to agree on most rows and
 * diverge exactly when someone is checking. So:
 *
 *   persona   — `routing.acting.persona` FIRST, because that is the persona the request was made
 *               AS, which is the one that governed the answer. `produced_for.user_persona` is the
 *               fallback and is the user's own. `action.owner_persona` is NOT used: it is the
 *               persona that owns the VERB, a property of the mesh and not of this answer.
 *   verb      — `routing.action.label` only. `verb_iri` is not a label and rendering an IRI under
 *               a heading that says "verb" invites it to be read as one.
 *   engine    — `routing.handled_by.engine_name` only.
 *   roll sha  — `produced_by.code_hash`, else `produced_by.version`. THE WIRE HAS NO ROLL-SHA
 *               FIELD; the session captures carry `fleet_sha`/`repo_sha` on the capture wrapper,
 *               which is not the artifact. So this is the nearest real thing and it is frequently
 *               absent. It is not synthesised from anything.
 *   timestamp — `created_at`, epoch MILLISECONDS, as ISO. Deliberately not `valid_as_of`: that is
 *               when the substrate was sampled, a different fact the card's own freshness stamp
 *               already carries, and quietly substituting it would put a grounding time under a
 *               heading a reader will take for "when this answer was produced".
 *   question  — `question_text`.
 *
 * Absent is returned as null throughout and rendered as the word absent. Nothing is defaulted to
 * a plausible value.
 */
export function readExportProvenance(artifact: {
  created_at?: number;
  question_text?: string;
  produced_by?: { code_hash?: string; version?: string } | null;
  produced_for?: { user_persona?: string | null } | null;
  routing?: {
    action?: { label?: string } | null;
    handled_by?: { engine_name?: string } | null;
    acting?: { persona?: string | null } | null;
  } | null;
}): ExportProvenance {
  const r = artifact.routing ?? null;
  const ms = artifact.created_at;
  const timestamp =
    typeof ms === "number" && Number.isFinite(ms) && ms > 0
      ? new Date(ms).toISOString()
      : null;

  return {
    persona: orNull(r?.acting?.persona) ?? orNull(artifact.produced_for?.user_persona),
    verb: orNull(r?.action?.label),
    engine: orNull(r?.handled_by?.engine_name),
    roll_sha: orNull(artifact.produced_by?.code_hash) ?? orNull(artifact.produced_by?.version),
    timestamp,
    question_asked: orNull(artifact.question_text),
  };
}

/** A filename that sorts by time and says what it is. No spaces, no colons. */
export function exportFileName(title: string, at: Date): string {
  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "card";
  const stamp = at.toISOString().replace(/[:.]/g, "-").replace(/Z$/, "");
  return `${slug}-${stamp}.html`;
}
