import { describe, it, expect } from "vitest";
import { ADD_MISSED_PART_NOT_BUILT_MESSAGE, EMPTY_CONFIRM_KIND, readEmptyConfirmTask, whyInWords } from "./emptyConfirm";

const payload = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  review_shape: "empty",
  ingest_id: "sha256:ab",
  attempt: 1,
  account: { n_tables: 2, grid_no_parts_col: 1, grid_rows_emitted: 0, review_reasons: ["a"], why: "zero_rows" },
  forced_text_fallback: false,
  add_missed_part: false,
  content_kind: "pcn",
  ...over,
});

describe("readEmptyConfirmTask", () => {
  it("reads a full payload", () => {
    expect(readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload())).toEqual({
      ingestId: "sha256:ab", attempt: 1, addMissedPart: false, forcedTextFallback: false, contentKind: "pcn",
      account: { nTables: 2, gridNoPartsCol: 1, gridRowsEmitted: 0, reviewReasons: ["a"], why: "zero_rows" },
    });
  });
  it.each([
    ["another kind", "document_promotion", payload()],
    ["no review_shape", EMPTY_CONFIRM_KIND, payload({ review_shape: undefined })],
    ["another review_shape", EMPTY_CONFIRM_KIND, payload({ review_shape: "rows" })],
    ["blank ingest_id", EMPTY_CONFIRM_KIND, payload({ ingest_id: "  " })],
    ["no ingest_id", EMPTY_CONFIRM_KIND, payload({ ingest_id: undefined })],
    ["a string payload", EMPTY_CONFIRM_KIND, JSON.stringify(payload())],
    ["an array payload", EMPTY_CONFIRM_KIND, [payload()]],
    ["null", EMPTY_CONFIRM_KIND, null],
  ])("is null for %s", (_n, kind, p) => {
    expect(readEmptyConfirmTask(kind, p)).toBeNull();
  });
  it("reads null figures as null, never 0", () => {
    const t = readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ account: { n_tables: null, grid_no_parts_col: null, grid_rows_emitted: null, review_reasons: [], why: null } }))!;
    expect(t.account).toEqual({ nTables: null, gridNoPartsCol: null, gridRowsEmitted: null, reviewReasons: [], why: null });
  });
  it("reads an absent account as all-unreported", () => {
    expect(readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ account: undefined }))!.account.nTables).toBeNull();
  });
  it.each([true, false, "2", 1.5, NaN])("refuses %j as a figure", (v) => {
    const t = readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ account: { n_tables: v, grid_rows_emitted: v } }))!;
    expect(t.account.nTables).toBeNull();
    expect(t.account.gridRowsEmitted).toBeNull();
  });
  it("add_missed_part and forced_text_fallback are true only for === true", () => {
    expect(readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ add_missed_part: true, forced_text_fallback: true }))).toMatchObject({ addMissedPart: true, forcedTextFallback: true });
    expect(readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ add_missed_part: "true", forced_text_fallback: 1 }))).toMatchObject({ addMissedPart: false, forcedTextFallback: false });
  });
  it("drops non-string review reasons", () => {
    const t = readEmptyConfirmTask(EMPTY_CONFIRM_KIND, payload({ account: { review_reasons: ["x", 3, "", null] } }))!;
    expect(t.account.reviewReasons).toEqual(["x"]);
  });
});

describe("whyInWords", () => {
  it.each([
    ["no_table", "No table was found in the document."],
    ["no_parts_column", "Tables were found, but none has a part-number column."],
    ["zero_rows", "Tables were found, but no part rows came out of them."],
    ["unknown", "The extraction gave no account of why it found nothing."],
    [null, "The extraction gave no account of why it found nothing."],
    ["scanned_blank", "The extraction says: scanned_blank"],
  ])("%j", (w, s) => expect(whyInWords(w)).toBe(s));
});

it("the refusal message is one sentence with no doubled space", () => {
  expect(ADD_MISSED_PART_NOT_BUILT_MESSAGE).not.toMatch(/ {2}/);
});
