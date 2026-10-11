import { describe, it, expect } from "vitest";
import { inferUploadKind, INGEST_KIND_EXTENSIONS } from "./ingestKindInfer";

const f = (name: string, body: string | Uint8Array) => new File([body as BlobPart], name);
const bytes = (...n: number[]) => new Uint8Array(n);
const enc = (s: string) => new TextEncoder().encode(s);
const cat = (...a: Uint8Array[]) => {
  const out = new Uint8Array(a.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of a) { out.set(x, o); o += x.length; }
  return out;
};

const PDF = "%PDF-1.4\n";
const XML = '<?xml version="1.0"?><dmodule/>';
const STEP = "ISO-10303-21;\nHEADER;";
const DWG = "AC1027\0\0\0";
const DXF = "  0\nSECTION\n  2\nHEADER\n";

// One row per table entry: [filename, agreeing body, kind, a body that contradicts it, what it sniffs as]
const ROWS: Array<[string, string, string, string, string | null]> = [
  ["a.pdf", PDF, "pdf", XML, "xml"],
  ["a.xml", XML, "xml", PDF, "pdf"],
  ["a.step", STEP, "cad", PDF, "pdf"],
  ["a.stp", STEP, "cad", XML, "xml"],
  ["a.dwg", DWG, "cad", PDF, "pdf"],
  ["a.dxf", DXF, "cad", "hello world", null],
];

describe("inferUploadKind — rows that have a magic", () => {
  for (const [name, good, kind, bad, sniffed] of ROWS) {
    it(`${name}: agreeing bytes -> ${kind}, not ambiguous`, async () => {
      expect(await inferUploadKind(f(name, good))).toEqual({ kind, ambiguous: false });
    });
    it(`${name}: contradicting bytes -> ambiguous, reason names both, sniffed=${sniffed}`, async () => {
      const r = await inferUploadKind(f(name, bad));
      expect(r.ambiguous).toBe(true);
      if (!r.ambiguous) return;
      expect(r.reason).toContain(name.slice(name.lastIndexOf(".")));
      if (sniffed) expect(r.reason).toContain(sniffed);
      expect(r.sniffed).toBe(sniffed);
    });
  }
});

describe("inferUploadKind — rows decided by the extension alone", () => {
  for (const ext of [".igs", ".iges", ".stl"]) {
    it(`${ext}: any bytes -> cad`, async () => {
      expect(await inferUploadKind(f(`part${ext}`, "whatever"))).toEqual({ kind: "cad", ambiguous: false });
      expect(await inferUploadKind(f(`PART${ext.toUpperCase()}`, PDF))).toEqual({ kind: "cad", ambiguous: false });
    });
  }
});

describe("inferUploadKind — the specifics", () => {
  it("pdf: %PDF- anywhere in the first 1024 bytes counts; beyond it does not", async () => {
    expect((await inferUploadKind(f("a.pdf", "junk".repeat(100) + PDF))).ambiguous).toBe(false);
    expect((await inferUploadKind(f("a.pdf", "x".repeat(1100) + PDF))).ambiguous).toBe(true);
  });
  it("a file with no extension is ambiguous, sniffed from the bytes", async () => {
    const r = await inferUploadKind(f("README", PDF));
    expect(r).toMatchObject({ ambiguous: true, sniffed: "pdf" });
    expect(await inferUploadKind(f("README", "plain"))).toMatchObject({ ambiguous: true, sniffed: null });
    expect(await inferUploadKind(f(".hidden", PDF))).toMatchObject({ ambiguous: true });
  });
  it("an unknown extension is ambiguous, sniffed from the bytes", async () => {
    const r = await inferUploadKind(f("a.docx", XML));
    expect(r).toMatchObject({ ambiguous: true, sniffed: "xml" });
    if (r.ambiguous) expect(r.reason).toContain(".docx");
  });
  it("a UTF-8 BOM then whitespace then < is xml", async () => {
    const body = cat(bytes(0xef, 0xbb, 0xbf), enc("\r\n  <root/>"));
    expect(await inferUploadKind(f("a.xml", body))).toEqual({ kind: "xml", ambiguous: false });
  });
  it("a UTF-16 BOM then < is xml (both byte orders)", async () => {
    expect(await inferUploadKind(f("a.xml", bytes(0xff, 0xfe, 0x3c, 0x00, 0x72, 0x00)))).toEqual({ kind: "xml", ambiguous: false });
    expect(await inferUploadKind(f("a.xml", bytes(0xfe, 0xff, 0x00, 0x3c, 0x00, 0x72)))).toEqual({ kind: "xml", ambiguous: false });
  });
  it("a .xml that does not start with < is ambiguous", async () => {
    expect((await inferUploadKind(f("a.xml", "hello <root/>"))).ambiguous).toBe(true);
  });
  it("the accept list is the table's extensions", () => {
    expect([...INGEST_KIND_EXTENSIONS].sort()).toEqual([".dwg", ".dxf", ".iges", ".igs", ".pdf", ".step", ".stl", ".stp", ".xml"]);
  });
});
