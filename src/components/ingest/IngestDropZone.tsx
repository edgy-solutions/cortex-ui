/**
 * IngestDropZone — drop a file, or click to choose one. PURE FILE SELECTION: no network call
 * lives here any more.
 *
 * `POST /ingest` requires `kind` as a required multipart field alongside `file` (the real wire —
 * see `src/lib/ingestWire.ts`'s header), so the flow is drop → pick kind → upload, not
 * drop-and-upload-immediately. `IngestPanel` composes this with `KindPicker` and sends the
 * multipart request itself once both a file and a kind are in hand; this component only ever
 * hands the chosen `File` up via `onFileSelected`.
 */
import { useRef } from "react";

export interface IngestDropZoneProps {
  onFileSelected: (file: File) => void;
}

export function IngestDropZone({ onFileSelected }: IngestDropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | null | undefined) => {
    if (!file) return;
    onFileSelected(file);
  };

  return (
    <div
      className="glass-panel p-6 my-2 border-dashed border-2 border-cyan-500/30 text-center cursor-pointer"
      data-ingest-drop
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        handleFile(e.dataTransfer.files?.[0]);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        data-ingest-file-input
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      <p className="text-sm text-slate-300">Drop a file here, or click to choose one</p>
    </div>
  );
}
