#!/usr/bin/env node
/**
 * Transport-declaration guard
 * ───────────────────────────────────────────────────────────────────────────
 * Every outbound call from this app must either go through the minting wrapper
 * (`src/api/client.ts`, whose axios interceptor attaches the caller's OIDC
 * bearer + X-Trace-Id + X-Session-Id) or carry an explicit
 *
 *     // transport-exception: <why this bypasses the wrapper>
 *
 * on the call line or within the 3 lines above it.
 *
 * WHY THIS EXISTS
 * A five-repo enumeration (invincible-agent `docs/plans/unminted-caller-enumeration.md`)
 * found call sites reaching gated services with no credential attached. In this
 * repo the instance was `NodeInspector.tsx`, which called a gated cortex-bff route
 * with no Authorization header for months. A recurring sweep re-earns that answer
 * forever; this converts "did someone add an unminted call?" from a question asked
 * periodically into a build failure.
 *
 * WHY IT RUNS IN `npm run build`
 * This repo has no test framework (see AGENTS.md). `npm run build` is the one
 * command that must succeed for an image to exist — CI's docker/build-push-action
 * runs the Dockerfile, which runs `npm run build`. Putting the guard anywhere else
 * would be a check nothing executes.
 *
 * NOTE ON SCOPE — read `docs/plans/legacy-dns-guard-phantom-scope.md` in
 * invincible-agent before editing the constants below. A sibling guard passed green
 * for months because it named a directory that did not exist and `continue`d past
 * it. A scan asserts its scope is inhabited: this one FAILS if the tree is missing,
 * if an allowlisted file is absent, or if it finds implausibly few sites.
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCAN_ROOT = join(ROOT, "src");
const EXTENSIONS = [".ts", ".tsx"];

/**
 * The minting wrapper. Sites inside it need no declaration — it IS the
 * declaration. Kept as a list so adding a second wrapper is a deliberate edit.
 */
const WRAPPER_FILES = ["src/api/client.ts"];

/**
 * POSITIVE CONTROL. The census at the time this guard landed was 8 transport
 * sites (3 in the wrapper, 5 outside). If the scanner finds fewer, either call
 * sites were genuinely removed — in which case lower this number in the same
 * commit that removes them — or the scanner has stopped seeing the tree.
 *
 * Without this, a broken walker, a renamed `src/`, or a regex that stops
 * matching all report the same cheerful green as a clean repo.
 */
const MIN_EXPECTED_SITES = 8;

const MARKER = "transport-exception:";

/**
 * A declaration is the contiguous comment block immediately above the call (or the
 * call line itself). Deliberately NOT a fixed line count: a good declaration explains
 * what identity the call carries and why it bypasses the wrapper, and that is often
 * several lines. A fixed lookback silently invalidates the longest — which is to say,
 * the most thorough — declarations.
 */
const MAX_COMMENT_BLOCK = 40;

/** Transport idioms. `new Foo(` forms are matched with the `new` to avoid types. */
const TRANSPORT_PATTERNS = [
  { name: "fetch", re: /\bfetch\s*\(/ },
  { name: "axios.<method>", re: /\baxios\s*\.\s*(get|post|put|patch|delete|head|options|request|create)\s*\(/ },
  { name: "axios()", re: /\baxios\s*\(/ },
  { name: "fetchEventSource", re: /\bfetchEventSource\s*\(/ },
  { name: "EventSource", re: /\bnew\s+EventSource\s*\(/ },
  { name: "WebSocket", re: /\bnew\s+WebSocket\s*\(/ },
  { name: "ShapeStream", re: /\bnew\s+ShapeStream\s*\(/ },
  { name: "XMLHttpRequest", re: /\bnew\s+XMLHttpRequest\s*\(/ },
  { name: "sendBeacon", re: /\bnavigator\s*\.\s*sendBeacon\s*\(/ },
];

/**
 * Blank out comments while preserving line count and column positions, so a
 * pattern can never match inside the guard's OWN explanatory prose. (A sibling
 * guard in invincible-agent tripped on a comment describing what it forbade.)
 * Returns an array of comment-stripped lines.
 */
function stripComments(source) {
  const out = [];
  let inBlock = false;
  for (const line of source.split(/\r?\n/)) {
    let result = "";
    let i = 0;
    let inStr = null;
    while (i < line.length) {
      const two = line.slice(i, i + 2);
      if (inBlock) {
        if (two === "*/") { inBlock = false; result += "  "; i += 2; }
        else { result += " "; i += 1; }
        continue;
      }
      if (inStr) {
        result += line[i];
        if (line[i] === "\\") { result += line[i + 1] ?? ""; i += 2; continue; }
        if (line[i] === inStr) inStr = null;
        i += 1;
        continue;
      }
      if (two === "//") { result += " ".repeat(line.length - i); break; }
      if (two === "/*") { inBlock = true; result += "  "; i += 2; continue; }
      if (line[i] === '"' || line[i] === "'" || line[i] === "`") inStr = line[i];
      result += line[i];
      i += 1;
    }
    out.push(result);
  }
  return out;
}

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walk(full));
    else if (EXTENSIONS.some((e) => entry.name.endsWith(e))) files.push(full);
  }
  return files;
}

function rel(p) {
  return relative(ROOT, p).split(sep).join("/");
}

/** Is `lineIdx` covered by a declaration — on the call line, or anywhere in the
 *  contiguous comment block directly above it? */
function isDeclared(rawLines, lineIdx) {
  if (rawLines[lineIdx].includes(MARKER)) return true;
  for (let i = lineIdx - 1, seen = 0; i >= 0 && seen < MAX_COMMENT_BLOCK; i -= 1, seen += 1) {
    const t = rawLines[i].trim();
    const isCommentLine = t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.endsWith("*/");
    if (!isCommentLine) return false; // block ended without a marker
    if (rawLines[i].includes(MARKER)) return true;
  }
  return false;
}

// ── Scope assertions — these run BEFORE any scanning ──────────────────────
const scopeErrors = [];
if (!existsSync(SCAN_ROOT) || !statSync(SCAN_ROOT).isDirectory()) {
  scopeErrors.push(`scan root ${rel(SCAN_ROOT)} does not exist — the guard's scope is empty, so its green would mean nothing`);
}
for (const w of WRAPPER_FILES) {
  if (!existsSync(join(ROOT, w))) {
    scopeErrors.push(`allowlisted wrapper ${w} does not exist — the exemption names a file that is gone`);
  }
}
if (scopeErrors.length) {
  console.error("✗ transport-declaration guard: SCOPE IS BROKEN\n");
  for (const e of scopeErrors) console.error(`  · ${e}`);
  console.error("\nA scan asserts its scope is inhabited. Fix the scope; do not silence the check.");
  process.exit(1);
}

// ── Scan ───────────────────────────────────────────────────────────────────
const violations = [];
const sitesByFile = new Map();
let totalSites = 0;

for (const file of walk(SCAN_ROOT)) {
  const relPath = rel(file);
  const source = readFileSync(file, "utf8");
  const rawLines = source.split(/\r?\n/);
  const codeLines = stripComments(source);
  const isWrapper = WRAPPER_FILES.includes(relPath);

  codeLines.forEach((code, idx) => {
    // An import binding is not a call site.
    if (/^\s*import\b/.test(code)) return;

    const hit = TRANSPORT_PATTERNS.find((p) => p.re.test(code));
    if (!hit) return;

    totalSites += 1;
    sitesByFile.set(relPath, (sitesByFile.get(relPath) ?? 0) + 1);
    if (isWrapper) return;

    if (!isDeclared(rawLines, idx)) {
      violations.push({ file: relPath, line: idx + 1, idiom: hit.name, text: rawLines[idx].trim() });
    }
  });
}

// ── Positive controls — the scan must have actually seen something ─────────
const controlErrors = [];
if (totalSites < MIN_EXPECTED_SITES) {
  controlErrors.push(
    `found ${totalSites} transport sites, expected at least ${MIN_EXPECTED_SITES}. ` +
    `Either sites were removed (lower MIN_EXPECTED_SITES in the same commit) or this scanner has stopped seeing them.`
  );
}
for (const w of WRAPPER_FILES) {
  if (!sitesByFile.has(w)) {
    controlErrors.push(`allowlisted wrapper ${w} contains NO transport sites — the exemption is covering nothing, which means it is either rotted or the scanner is broken`);
  }
}
if (controlErrors.length) {
  console.error("✗ transport-declaration guard: POSITIVE CONTROL FAILED\n");
  for (const e of controlErrors) console.error(`  · ${e}`);
  console.error("\nThe guard cannot distinguish 'nothing undeclared here' from 'nothing here'.");
  process.exit(1);
}

// ── Report ─────────────────────────────────────────────────────────────────
if (violations.length) {
  console.error(`✗ transport-declaration guard: ${violations.length} undeclared transport site(s)\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  [${v.idiom}]`);
    console.error(`      ${v.text}`);
  }
  console.error(
    `\nEvery outbound call must go through src/api/client.ts (which attaches the caller's\n` +
    `bearer + trace headers) or carry an explicit declaration on the call line or within\n` +
    `${MARKER_LOOKBACK} lines above it:\n\n` +
    `    // ${MARKER} raw fetch — carries the caller's OIDC bearer explicitly.\n\n` +
    `If the call genuinely needs no identity, say so in the declaration. The point is that\n` +
    `it is a decision someone wrote down, not an omission nobody noticed.`
  );
  process.exit(1);
}

console.log(`✓ transport-declaration guard: ${totalSites} site(s) across ${sitesByFile.size} file(s), all accounted for`);
