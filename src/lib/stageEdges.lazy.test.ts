/**
 * Same-subject edges are LAZY: nothing pairwise runs on load, and an opened answer gets exactly
 * the edges the old all-pairs function gave it.
 */
import { describe, it, expect } from "vitest";
import type { Artifact } from "@/api/types";
import {
  computeSameSubjectEdges,
  connectedComponents,
  indexSubjects,
  sameSubjectEdgesFor,
  subjectChainEdges,
} from "./stageEdges";

const art = (id: string, subject: string | null): Artifact =>
  ({
    id,
    routing: subject
      ? { about: { instance_resolved: true, instance_identifier: subject, label: "L" } }
      : { about: { instance_resolved: false, label: "L" } },
  }) as unknown as Artifact;

const key = (e: { from: string; to: string }) => `${e.from}>${e.to}`;

describe("lazy same-subject edges", () => {
  const ONE_SUBJECT = Array.from({ length: 40 }, (_, i) => art(`a${i}`, "urn:s:1"));

  it("with nothing opened there are 0 same-subject edges, however many share a subject", () => {
    const idx = indexSubjects(ONE_SUBJECT);
    expect(sameSubjectEdgesFor([], idx)).toHaveLength(0);
    // and the all-pairs function it replaces on load would have produced k(k-1)/2
    expect(computeSameSubjectEdges(ONE_SUBJECT)).toHaveLength(40 * 39 / 2);
  });

  it("one opened answer gets k-1 edges: the all-pairs set restricted to that node", () => {
    const idx = indexSubjects(ONE_SUBJECT);
    const lazy = sameSubjectEdgesFor(["a7"], idx);
    const restricted = computeSameSubjectEdges(ONE_SUBJECT).filter((e) => e.from === "a7" || e.to === "a7");
    expect(lazy).toHaveLength(39);
    expect(new Set(lazy.map(key))).toEqual(new Set(restricted.map(key)));
  });

  it("two opened answers in one group share their edge once", () => {
    const idx = indexSubjects(ONE_SUBJECT);
    const lazy = sameSubjectEdgesFor(["a3", "a9"], idx);
    // 39 + 39 - 1 shared
    expect(lazy).toHaveLength(77);
    expect(new Set(lazy.map(key)).size).toBe(77);
  });

  it("an opened answer with no resolved instance has no edges, and other groups are untouched", () => {
    const items = [art("x", null), art("p1", "urn:s:p"), art("p2", "urn:s:p"), art("q1", "urn:s:q"), art("q2", "urn:s:q")];
    const idx = indexSubjects(items);
    expect(sameSubjectEdgesFor(["x"], idx)).toHaveLength(0);
    expect(sameSubjectEdgesFor(["p1"], idx).map(key)).toEqual(["p1>p2"]);
  });

  it("the layout chain has the same connected components as the full edge set, in k-1 edges", () => {
    const items = [...ONE_SUBJECT, art("x", null), art("p1", "urn:s:p"), art("p2", "urn:s:p"), art("lone", "urn:s:z")];
    const ids = items.map((a) => a.id);
    const chain = subjectChainEdges(indexSubjects(items));
    expect(chain).toHaveLength(39 + 1);
    const norm = (cs: string[][]) => cs.map((c) => [...c].sort().join(",")).sort();
    expect(norm(connectedComponents(ids, chain))).toEqual(
      norm(connectedComponents(ids, computeSameSubjectEdges(items))),
    );
  });
});
