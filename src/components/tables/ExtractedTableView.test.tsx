/**
 * Rendering seals for `ExtractedTableView`. Mutants T1-T3/T6 are fired by hand (see the
 * session report) and must redden a named assertion here. T5 (a scratch raw-HTML write
 * added to the view) is sealed by the source census in `src/lib/extractedTable.test.ts`,
 * which scans this component's file text too.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ExtractedTableView } from "./ExtractedTableView";
import { ABSENT_MARK } from "@/lib/cardExport";
import {
  THEAD_TBODY_RECORD,
  BARE_TR_RECORD,
  UNSTRUCTURED_RECORD,
  HOSTILE_SCRIPT_IMG_RECORD,
  HOSTILE_SPAN_RECORD,
  NO_TABLE_RECORD,
} from "./extractedTable.fixtures";

afterEach(() => cleanup());

describe("[seal 1] thead/tbody", () => {
  it("draws 1 head row and 1 body row, structured", () => {
    const { container } = render(
      <ExtractedTableView record={THEAD_TBODY_RECORD} document={{ label: "SPEC-001" }} />,
    );
    const root = container.querySelector('[data-extracted-table="structured"]');
    expect(root).not.toBeNull();
    expect(root!.querySelectorAll("thead tr")).toHaveLength(1);
    expect(root!.querySelectorAll("tbody tr")).toHaveLength(1);
    expect(container.querySelectorAll("table")).toHaveLength(1);

    expect(container.textContent).toContain("SPEC-001");
    expect(container.textContent).toContain("p. 3");
    const idEl = container.querySelector('[data-table-element-id="el_hand_0001"]');
    expect(idEl).not.toBeNull();
    expect(idEl!.textContent).toBe("el_hand_0001");
  });
});

describe("[seal 2 / T3] bare <tr>", () => {
  it("keeps the <th> row in body, header:true, none promoted to head", () => {
    const { container } = render(<ExtractedTableView record={BARE_TR_RECORD} />);
    const root = container.querySelector('[data-extracted-table="structured"]')!;
    expect(root.querySelectorAll("thead tr")).toHaveLength(0);
    const bodyRows = root.querySelectorAll("tbody tr");
    expect(bodyRows).toHaveLength(2);
    const firstCell = bodyRows[0].children[0];
    expect(firstCell.tagName).toBe("TH");
    expect(firstCell.textContent).toBe("A");
    const secondCell = bodyRows[1].children[0];
    expect(secondCell.tagName).toBe("TD");
    expect(secondCell.textContent).toBe("1");
  });
});

describe("[seal 3] unstructured", () => {
  it("draws the sentence and the raw text, no <table>", () => {
    const { container } = render(<ExtractedTableView record={UNSTRUCTURED_RECORD} />);
    expect(container.querySelector("table")).toBeNull();
    const root = container.querySelector('[data-extracted-table="unstructured"]');
    expect(root).not.toBeNull();
    expect(root!.textContent).toContain("Structure unavailable — raw extracted text:");
    expect(root!.textContent).toContain("raw cells only");
  });
});

describe("[seal 4 / T1 / T2 / T5] hostile", () => {
  it("renders no script/img element and no on* attribute, keeps sibling text, clamps spans", () => {
    const { container } = render(<ExtractedTableView record={HOSTILE_SCRIPT_IMG_RECORD} />);
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    for (const el of Array.from(container.querySelectorAll("*"))) {
      for (const attr of Array.from(el.attributes)) {
        expect(attr.name.toLowerCase().startsWith("on")).toBe(false);
      }
    }
    expect(container.textContent).toContain("x");
    expect(container.textContent).toContain("y");
    expect(container.textContent).not.toContain("alert(1)");
  });

  it("[T2] clamps colspan 999 and rowspan -1 to 1 on the rendered cells", () => {
    const { container } = render(<ExtractedTableView record={HOSTILE_SPAN_RECORD} />);
    const cells = container.querySelectorAll('[data-extracted-table="structured"] td, [data-extracted-table="structured"] th');
    expect(cells).toHaveLength(2);
    for (const cell of Array.from(cells)) {
      expect((cell as HTMLTableCellElement).colSpan).toBe(1);
      expect((cell as HTMLTableCellElement).rowSpan).toBe(1);
    }
  });
});

describe("[seal 5] no table", () => {
  it("parseTableHtml-unparseable html draws the unstructured branch", () => {
    const { container } = render(<ExtractedTableView record={NO_TABLE_RECORD} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.querySelector('[data-extracted-table="unstructured"]')).not.toBeNull();
  });
});

describe("[seal 6] absent header fields", () => {
  it("page_number null draws ABSENT_MARK, never 'p. 0' or 'p. undefined'", () => {
    const record = { ...BARE_TR_RECORD, page_number: null };
    const { container } = render(<ExtractedTableView record={record} />);
    expect(container.textContent).not.toContain("p. 0");
    expect(container.textContent).not.toContain("p. undefined");
    expect(container.textContent).toContain(ABSENT_MARK);
  });

  it("no document given draws ABSENT_MARK for the label", () => {
    const { container } = render(<ExtractedTableView record={BARE_TR_RECORD} />);
    expect(container.textContent).toContain(ABSENT_MARK);
  });
});

describe("provenance footer", () => {
  it("draws bbox and page dims only when bbox is non-null", () => {
    const { container: withBbox } = render(<ExtractedTableView record={THEAD_TBODY_RECORD} />);
    expect(withBbox.textContent).toContain("bbox [10, 20, 400, 120]");
    expect(withBbox.textContent).toContain("612");
    expect(withBbox.textContent).toContain("792");

    const { container: withoutBbox } = render(<ExtractedTableView record={BARE_TR_RECORD} />);
    expect(withoutBbox.textContent).not.toContain("bbox [");
  });
});

describe("interaction", () => {
  it("stops a pointerdown from reaching an ancestor (no canvas drag start)", () => {
    const onPointerDown = vi.fn();
    const { container } = render(
      // eslint-disable-next-line jsx-a11y/no-static-element-interactions
      <div onPointerDown={onPointerDown}>
        <ExtractedTableView record={THEAD_TBODY_RECORD} />
      </div>,
    );
    const target = container.querySelector('[data-table-element-id]')!;
    fireEvent.pointerDown(target);
    expect(onPointerDown).not.toHaveBeenCalled();
  });
});

describe("[seal 8] inert census", () => {
  // flip when Lane 1 names the archetype and serves the envelope
  it("no non-test src file outside src/components/tables and src/lib/extractedTable* imports ExtractedTableView", () => {
    const srcRoot = join(__dirname, "..", "..");
    const offenders: string[] = [];
    const scanned: string[] = [];

    function walk(dir: string) {
      for (const name of readdirSync(dir)) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(name)) continue;
        if (/\.test\.(ts|tsx)$/.test(name)) continue;

        const rel = full.split(/[\\/]/).join("/");
        if (rel.includes("/components/tables/")) continue;
        if (/\/lib\/extractedTable(\.|$)/.test(rel)) continue;

        scanned.push(rel);
        const text = readFileSync(full, "utf8");
        if (text.includes("ExtractedTableView")) offenders.push(rel);
      }
    }
    walk(srcRoot);

    // Guard against reading zero files — a broken walk and a genuinely inert
    // component read the same (empty) offenders list.
    expect(scanned.length).toBeGreaterThan(50);
    expect(offenders).toEqual([]);
  });
});

// [seal 9]
it.todo(
  "a served DOORS export capture — awaits identity.document_identity (doc-tools UNBUILT_PASSES) and Lane 1's envelope",
);
