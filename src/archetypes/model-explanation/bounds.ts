/**
 * A property's cardinality, read by enumeration (cortex-proposed, like the rest of `contract.ts`).
 *
 * Lane/74 measured origin/master `5d8800e0`: the ratified model states NO cardinality — no SHACL,
 * no `owl:*Cardinality`. So a missing bound is "the model states none", never `0` or `*`; a `*` is
 * drawn only for an explicit `max: "unbounded"` (architect, 10-17: "null = not stated, never
 * 'unbounded'").
 */
import type { ModelProperty } from "./contract";

export type BoundsState = "stated" | "part-stated" | "not-stated" | "unreadable";

type Bound = { kind: "stated"; text: string } | { kind: "not-stated" } | { kind: "unreadable" };

const isCount = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;

function readMin(x: unknown): Bound {
  if (x === undefined || x === null) return { kind: "not-stated" };
  return isCount(x) ? { kind: "stated", text: String(x) } : { kind: "unreadable" };
}

function readMax(x: unknown): Bound {
  if (x === undefined || x === null) return { kind: "not-stated" };
  if (x === "unbounded") return { kind: "stated", text: "*" };
  return isCount(x) ? { kind: "stated", text: String(x) } : { kind: "unreadable" };
}

export function readBounds(p: Pick<ModelProperty, "min" | "max">): { state: BoundsState; text?: string } {
  const min = readMin(p.min);
  const max = readMax(p.max);
  if (min.kind === "unreadable" || max.kind === "unreadable") return { state: "unreadable" };
  if (isCount(p.min) && isCount(p.max) && p.max < p.min) return { state: "unreadable" };
  if (min.kind === "not-stated" && max.kind === "not-stated") return { state: "not-stated" };
  const text = `${min.kind === "stated" ? min.text : "?"}..${max.kind === "stated" ? max.text : "?"}`;
  return { state: min.kind === "stated" && max.kind === "stated" ? "stated" : "part-stated", text };
}
