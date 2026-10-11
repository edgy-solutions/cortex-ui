/**
 * ingestKindInfer — the top-level upload kind (`pdf | cad | xml`) from the file itself.
 *
 * Ruling: infer from the extension PLUS sniffed magic bytes, and never ask — except when it is
 * ambiguous: no extension, an unknown extension, or an extension and bytes that disagree. The
 * leaf-kind confirmation after classification (`IngestKindSuggestion`) is a different step and stays.
 *
 * OPEN QUESTION for Lane 1 and doc-tools: the platform declares NO cad extension list (IA's
 * gateway has none — it takes `kind` as a bare multipart field). The cad set below
 * (.step .stp .dwg .dxf .igs .iges .stl) is CORTEX'S CHOICE, not a contract. If the platform or
 * doc-tools own a list, replace this table's cad rows with it.
 *
 * One table, one row per extension. `magic` returns true when the bytes agree with the extension;
 * `null` means no reliable magic exists, so the extension alone decides.
 */
import type { IngestUploadKind } from "@/lib/ingestWire";

export type Inferred =
  | { kind: IngestUploadKind; ambiguous: false }
  | { ambiguous: true; reason: string; sniffed: IngestUploadKind | null };

const HEAD_BYTES = 1024;

const ascii = (b: Uint8Array, from: number, len: number): string =>
  String.fromCharCode(...b.subarray(from, from + len));

const startsWith = (b: Uint8Array, s: string): boolean => ascii(b, 0, s.length) === s;

const hasPdfMagic = (b: Uint8Array): boolean => ascii(b, 0, HEAD_BYTES).includes("%PDF-");

/** After an optional UTF-8 BOM and whitespace the first byte is `<`; or a UTF-16 BOM then `<`. */
function hasXmlStart(b: Uint8Array): boolean {
  if (b.length >= 3 && b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xfe) return b[2] === 0x3c && b[3] === 0x00;
  if (b.length >= 4 && b[0] === 0xfe && b[1] === 0xff) return b[2] === 0x00 && b[3] === 0x3c;
  let i = 0;
  while (i < b.length && (b[i] === 0x20 || b[i] === 0x09 || b[i] === 0x0a || b[i] === 0x0d)) i++;
  return b[i] === 0x3c;
}

const hasStepMagic = (b: Uint8Array): boolean => startsWith(b, "ISO-10303-21");
const hasDwgMagic = (b: Uint8Array): boolean => startsWith(b, "AC10");

function hasDxfMagic(b: Uint8Array): boolean {
  const first = ascii(b, 0, HEAD_BYTES)
    .split(/\r\n|\r|\n/)
    .find((l) => l.trim() !== "");
  return first !== undefined && first.trim() === "0";
}

interface Row {
  kind: IngestUploadKind;
  magic: ((b: Uint8Array) => boolean) | null;
}

const TABLE: Record<string, Row> = {
  ".pdf": { kind: "pdf", magic: hasPdfMagic },
  ".xml": { kind: "xml", magic: hasXmlStart },
  ".step": { kind: "cad", magic: hasStepMagic },
  ".stp": { kind: "cad", magic: hasStepMagic },
  ".dwg": { kind: "cad", magic: hasDwgMagic },
  ".dxf": { kind: "cad", magic: hasDxfMagic },
  ".igs": { kind: "cad", magic: null },
  ".iges": { kind: "cad", magic: null },
  ".stl": { kind: "cad", magic: null },
};

/** The extensions the table decides on, for the attach input's `accept`. */
export const INGEST_KIND_EXTENSIONS: readonly string[] = Object.keys(TABLE);

/** What the bytes alone say, when they carry an unmistakable magic; else null. */
function sniff(b: Uint8Array): IngestUploadKind | null {
  if (hasPdfMagic(b)) return "pdf";
  if (hasStepMagic(b) || hasDwgMagic(b)) return "cad";
  if (hasXmlStart(b)) return "xml";
  return null;
}

function extensionOf(name: string): string | null {
  const i = name.lastIndexOf(".");
  return i > 0 && i < name.length - 1 ? name.slice(i).toLowerCase() : null;
}

async function readHead(file: File): Promise<Uint8Array> {
  const slice = file.slice(0, HEAD_BYTES);
  if (typeof slice.arrayBuffer === "function") return new Uint8Array(await slice.arrayBuffer());
  // Older jsdom Blobs have no arrayBuffer().
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(slice);
  });
}

export async function inferUploadKind(file: File): Promise<Inferred> {
  let bytes: Uint8Array;
  try {
    bytes = await readHead(file);
  } catch {
    bytes = new Uint8Array(0);
  }
  const sniffed = sniff(bytes);
  const ext = extensionOf(file.name);
  if (ext === null) {
    return { ambiguous: true, reason: "No file extension — pick the kind.", sniffed };
  }
  const row = TABLE[ext];
  if (!row) {
    return { ambiguous: true, reason: `Unknown extension ${ext} — pick the kind.`, sniffed };
  }
  if (row.magic && !row.magic(bytes)) {
    const looks = sniffed ? `look like ${sniffed}` : "do not match";
    return {
      ambiguous: true,
      reason: `Named ${ext} but the bytes ${looks} — pick the kind.`,
      sniffed,
    };
  }
  return { kind: row.kind, ambiguous: false };
}
