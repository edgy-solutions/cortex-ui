/**
 * PARSE, AND REFUSE THE SOURCE THAT DID NOT PARSE — because `createSourceFile` will not.
 *
 * ── THE HOLE THIS CLOSES ──────────────────────────────────────────────────────────────────
 *
 * Three test suites in this repo walk the AST of real source to assert a property across a
 * POPULATION rather than an instance: no hook after an early return, every interpreter threads
 * its artifact id, every folded ask carries one. Each of them builds its tree with
 * `ts.createSourceFile`, and that function is ERROR-TOLERANT BY DESIGN. It does not throw on a
 * syntax error; it returns a degraded tree and records the problem on `parseDiagnostics`, which
 * nobody was reading.
 *
 * For an assertion of the form "the scan found NOTHING WRONG" that is fatal. A probe fixture
 * with a typo parses to garbage, the walk finds no violations because it can no longer see the
 * constructs it was looking for, and the test reports green FOR THE OPPOSITE REASON to the one
 * in its comment. The negative controls — "does NOT flag a hook below an unrelated nested
 * return" — are exactly that shape.
 *
 * ── WHY IT IS WORTH A MODULE ──────────────────────────────────────────────────────────────
 *
 * The LangGraph lane hit the same class from the other side on the same day: a syntax check
 * built on `ast.parse` accepted a file that could not be imported, because a `return` outside a
 * function is a COMPILE-time error and not a parse-time one. Their checker was strictly weaker
 * than the thing it stood in for and reported green on a service that would not start.
 *
 * Same rule, two languages: A PARSER IS NOT A VALIDATOR. If a check stands in for "this source
 * is well-formed", it has to actually ask.
 *
 * This does not claim to be a type check. `tsc` runs over the real tree in the build and is the
 * authority there; what this adds is the floor those scans were missing — that the thing they
 * walked was syntactically real, which matters most for the hand-written fixtures that never
 * meet `tsc` at all.
 */
import ts from "typescript";

/**
 * Parse to a `SourceFile`, throwing if the text did not parse cleanly.
 *
 * `parseDiagnostics` is an internal property rather than public API, so it is read defensively —
 * a TypeScript version that stops exposing it makes this function pass everything through
 * rather than making every scan explode on source that is perfectly fine.
 *
 * THAT SILENCE IS NOT LEFT TO ITSELF. A guard that can quietly stop guarding is the very thing
 * this file was written to remove, so the control beside the hook scan feeds it deliberately
 * broken source and requires a throw. If the property is ever renamed away, that control goes
 * RED and says so; the scans keep working in the meantime. Degrade quietly in production, fail
 * loudly in the test — the alternative is a check that cannot fail, which is no check.
 */
export function parseSourceOrThrow(
  fileName: string,
  text: string,
  kind: ts.ScriptKind = ts.ScriptKind.TSX,
): ts.SourceFile {
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);

  const diagnostics = (sf as unknown as { parseDiagnostics?: readonly ts.Diagnostic[] })
    .parseDiagnostics;
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) return sf;

  const detail = diagnostics
    .slice(0, 3)
    .map((d) => {
      const message = ts.flattenDiagnosticMessageText(d.messageText, " ");
      if (typeof d.start !== "number") return message;
      const { line, character } = sf.getLineAndCharacterOfPosition(d.start);
      return `${line + 1}:${character + 1} ${message}`;
    })
    .join("; ");

  throw new Error(
    `${fileName} did not parse (${diagnostics.length} syntax error(s)): ${detail}. ` +
      "A scan over a tree this broken reports NO findings, which is indistinguishable from a " +
      "clean result — so it refuses instead.",
  );
}
