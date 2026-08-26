/**
 * Type shim for `@svar-ui/gantt-locales`, which ships JS with no `.d.ts`.
 *
 * WHY A SHIM AND NOT `any` AT THE CALL SITE. An inline `// @ts-expect-error` would silence the
 * error where it is read and nowhere else, so the next import of this package gets the same
 * failure and the same one-line suppression. Declaring the module once puts the fact — this
 * package is untyped, here is its shape — in the place the compiler looks.
 *
 * WHAT THE VALUE ACTUALLY IS: a dictionary of translation strings and date-format patterns
 * that `Locale` from `@svar-ui/react-core` consumes. It is opaque to this codebase — nothing
 * here reads a key out of it — so `Record<string, unknown>` is HONEST rather than lazy. A
 * hand-written interface enumerating its keys would be a second source of truth for a shape
 * this repo does not own and cannot verify, and it would go stale silently on the first
 * upstream locale addition.
 *
 * WHY THE PACKAGE IS A DIRECT DEPENDENCY. It was reachable without one — npm hoists it as a
 * transitive dep of `@svar-ui/react-gantt` — and importing it that way works right up until
 * react-gantt changes its own dependencies, at which point a component breaks for a reason
 * that appears nowhere in this repo's package.json. Declared explicitly alongside
 * `@svar-ui/react-core` for the same reason.
 */
declare module "@svar-ui/gantt-locales" {
  /** English locale: translation strings plus the date-format patterns the scale reads. */
  export const en: Record<string, unknown>;
  export const cn: Record<string, unknown>;
}

declare module "@svar-ui/core-locales" {
  /** Core locale: the `calendar` block (month and day names) the date formatter substitutes
   *  from. Distinct from gantt-locales, which carries only the gantt's UI labels. */
  export const en: Record<string, unknown>;
}
