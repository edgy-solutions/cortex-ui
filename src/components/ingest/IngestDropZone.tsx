/**
 * IngestDropZone — drop a file, or click to choose one. PURE FILE SELECTION: no network call
 * lives here any more.
 *
 * `POST /ingest` requires `kind` as a required multipart field alongside `file` (the real wire —
 * see `src/lib/ingestWire.ts`'s header), so the flow is drop → pick kind → upload, not
 * drop-and-upload-immediately. `IngestPanel` composes this with `KindPicker` and sends the
 * multipart request itself once both a file and a kind are in hand; this component only ever
 * hands the chosen `File` up via `onFileSelected`.
 *
 * P0 2026-10-08 (sandbox rev 182): a drop navigated the tab to the file, and the pill opened no
 * chooser. So every drag event here is cancelled AND stopped (an ancestor's handler must not get
 * a say), the pill is a real focusable button that opens the input from Enter/Space as well as a
 * click, and a drop that misses the pill is caught by `useFileDropGuard` (window level). Proven
 * through the pointer, not `setInputFiles`, by `e2e/ingestDrop.spec.ts`.
 */
import { useRef, type DragEvent } from "react";

/** The order's accept list: PDFs and XML. */
export const INGEST_ACCEPT = "application/pdf,.pdf,.xml,application/xml,text/xml";

export interface IngestDropZoneProps {
  onFileSelected: (file: File) => void;
}

export function IngestDropZone({ onFileSelected }: IngestDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    onFileSelected(file);
  };

  const hold = (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const open = () => inputRef.current?.click();

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Drop a file here, or click to choose one"
      className="glass-panel p-6 my-2 border-dashed border-2 border-cyan-500/30 text-center cursor-pointer"
      data-ingest-drop
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      }}
      onDragEnter={hold}
      onDragOver={hold}
      onDrop={(e) => {
        hold(e);
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={INGEST_ACCEPT}
        className="hidden"
        data-ingest-file-input
        // The input sits inside the clickable zone: its own click must not bubble back into
        // `open` and re-trigger the chooser.
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => {
          handleFile(e.target.files?.[0]);
          // Choosing the same file twice in a row fires no change event unless the value resets.
          e.target.value = "";
        }}
      />
      <p className="text-sm text-slate-300">Drop a file here, or click to choose one</p>
    </div>
  );
}
