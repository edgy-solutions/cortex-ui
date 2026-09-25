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
 *   3. THE PRODUCER'S METHOD   — formula, inputs, bound. Or the sentence. See below.
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

/** The exact words drawn where a method block would be, when the producer supplied none. */
export const METHOD_ABSENT_SENTENCE = "method not supplied";

/** Drawn for any single provenance line the artifact did not carry. */
export const ABSENT_MARK = "absent";

/** One named input to a formula, as the producer states it. Both sides verbatim. */
export interface MethodInput {
  name: string;
  value: string;
}

/**
 * The producer's account of how it computed the figures on the card.
 * `formula` is required — see the header. `bound` is null when the producer stated none.
 */
export interface MethodBlock {
  formula: string;
  inputs: MethodInput[];
  bound: string | null;
}

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
 * Read the producer's method block, or nothing.
 *
 * Dropped whole when there is no formula. `inputs` entries with no name are dropped
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
      inputs.push({ name, value: formatLeaf(i.value) });
    }
  } else if (isRecord(raw.inputs)) {
    // The producer may send inputs as `{name: value}`. Both shapes read to the same pairs;
    // neither is preferred, because guessing which one is canonical is how one of them
    // silently renders as nothing.
    for (const name of Object.keys(raw.inputs)) {
      if (!name.trim()) continue;
      inputs.push({ name: name.trim(), value: formatLeaf(raw.inputs[name]) });
    }
  }

  const boundRaw = raw.bound;
  const bound =
    boundRaw === null || boundRaw === undefined ? null : formatLeaf(boundRaw) || null;

  return { formula, inputs, bound };
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
    ? `<table class="cx-table"><thead><tr><th>input</th><th>value</th></tr></thead><tbody>` +
      m.inputs
        .map(
          (i) =>
            `<tr><td class="cx-path">${escapeHtml(i.name)}</td>` +
            `<td class="cx-value">${escapeHtml(i.value)}</td></tr>`,
        )
        .join("") +
      `</tbody></table>`
    : `<p>inputs: ${absentSpan(ABSENT_MARK)}</p>`;
  const bound = m.bound
    ? `<p class="cx-note">bound: <strong>${escapeHtml(m.bound)}</strong></p>`
    : `<p class="cx-note">bound: ${absentSpan(ABSENT_MARK)}</p>`;
  return section(
    "How the producer computed this",
    `<div data-cx-method="present">` +
      `<p class="cx-formula">${escapeHtml(m.formula)}</p>${inputRows}${bound}</div>`,
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
