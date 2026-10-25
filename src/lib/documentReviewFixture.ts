/**
 * PROPOSED shape — no producer declares this yet; see sessions/ packet to Lane 1 and 7f.
 *
 * A work-instruction document (7f's `document` leaf is for work instructions): five sections over
 * seven pages. The payload keys are spelled here as DATA because a fixture must be the wire; the
 * names are still Cortex's proposal (see `documentReview.ts`, the one reader).
 */

const HEADER = {
  title: "Hydraulic pump removal and refit",
  doc_id: "WI-2231",
  revision: null as string | null, // one null on purpose: the card must read "not stated", never blank
  date: "2026-09-14",
};

const SECTIONS = [
  { section_id: "s1", title: "Scope and safety", page: 1 },
  { section_id: "s2", title: "Tools and consumables", page: 2 },
  { section_id: "s3", title: "Removal procedure", page: 3, page_end: 4 },
  { section_id: "s4", title: "Refit and torque values", page: 5 },
  { section_id: "s5", title: "Return to service checks", page: 7 },
];

export const FIXTURE_DOCUMENT_INGEST_ID = `sha256:${"d0c5ec71".padEnd(64, "b")}`;

export function fixtureDocumentReviewPayload(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    review_shape: "document",
    ingest_id: FIXTURE_DOCUMENT_INGEST_ID,
    header: { ...HEADER },
    sections: SECTIONS.map((s) => ({ ...s })),
    ...over,
  };
}

/** One malformed section (a page of 0): the reader drops it and counts it. */
export function fixtureDocumentReviewMalformed(): Record<string, unknown> {
  const sections: Record<string, unknown>[] = SECTIONS.map((s) => ({ ...s }));
  sections[1] = { section_id: "s2", title: "Tools and consumables", page: 0 };
  return fixtureDocumentReviewPayload({ sections });
}

/** Two sections sharing a section_id: the reader refuses the task. */
export function fixtureDocumentReviewDuplicate(): Record<string, unknown> {
  const sections: Record<string, unknown>[] = SECTIONS.map((s) => ({ ...s }));
  sections[3] = { ...sections[3], section_id: "s1" };
  return fixtureDocumentReviewPayload({ sections });
}
