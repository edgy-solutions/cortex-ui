import { describe, it, expect } from "vitest";
import { ingestToArtifact, type IngestEntry } from "@/lib/ingestArtifact";
import { readIngestStatusRow } from "@/lib/ingestWire";
import { enteredAwaitingKind, needsYouArtifactIds } from "@/lib/needsYou";
import type { Artifact } from "@/api/types";

const T = 1790860800000;
const sha = (n: string) => `sha256:${n.padEnd(64, "0")}`;
const entry = (n: string, stage: string): IngestEntry => ({
  key: sha(n), filename: `${n}.pdf`, kind: "pdf", droppedAt: T, phase: "status", ingestId: sha(n), error: null,
  acceptedThisSession: true, duplicate: null, note: null, notFound: false,
  row: readIngestStatusRow({
    ingest_id: sha(n), sha256: sha(n).slice(7), kind: "pdf", stage, detail: null, duplicate: null,
    created_at: T, updated_at: T, origin: null, case_id: null,
  }),
});
const dropAt = (n: string, stage: string): Artifact => ingestToArtifact(entry(n, stage));

const at = (stage: string) => ({ stage }) as { stage: never };

describe("needsYou", () => {
  it("needsYouArtifactIds counts only ingest artifacts at awaiting_kind", () => {
    const answer = { id: "ans", rendered_output: { components: [{ archetype: "MULTI_SERIES", rows: [] }] } } as unknown as Artifact;
    const a = dropAt("aa", "awaiting_kind");
    const b = dropAt("bb", "extracting");
    const c = dropAt("cc", "review");
    const d = dropAt("dd", "awaiting_kind");
    expect(needsYouArtifactIds([answer, a, b, c, d])).toEqual([a.id, d.id]);
  });

  it("enteredAwaitingKind fires on extracting → awaiting_kind", () => {
    expect(enteredAwaitingKind({ x: at("extracting") }, { x: at("awaiting_kind") })).toEqual(["x"]);
  });

  it("enteredAwaitingKind does not fire for a row first seen at awaiting_kind", () => {
    expect(enteredAwaitingKind({}, { x: at("awaiting_kind") })).toEqual([]);
  });

  it("enteredAwaitingKind does not fire for awaiting_kind → awaiting_kind", () => {
    expect(enteredAwaitingKind({ x: at("awaiting_kind") }, { x: at("awaiting_kind") })).toEqual([]);
  });

  it("enteredAwaitingKind does not fire for a move between two other stages", () => {
    // The breaking input for the next-stage check: the arm below starts AT awaiting_kind, so it never reaches it.
    expect(enteredAwaitingKind({ x: at("extracting") }, { x: at("review") })).toEqual([]);
  });

  it("enteredAwaitingKind does not fire for awaiting_kind → received", () => {
    expect(enteredAwaitingKind({ x: at("awaiting_kind") }, { x: at("received") })).toEqual([]);
  });
});
