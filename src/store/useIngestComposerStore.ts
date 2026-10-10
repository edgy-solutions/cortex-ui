/**
 * useIngestComposerStore — "the drop is the prompt" (architect ruling 2026-10-09).
 *
 * Holds (a) the composer's attached DRAFT (a file + the human-confirmed kind) and (b) the ingest
 * TURNS the left list renders under their own header. Ephemeral on purpose: a File cannot be
 * persisted, and a turn's durable record is the server's ingest row (the status card polls it).
 *
 * `submit` is the only network caller and goes through `uploadIngest` (the guarded transport) —
 * no fetch site lives here. Errors keep the server's plain-string `detail` verbatim.
 */
import { create } from "zustand";
import { uploadIngest } from "@/lib/ingestTransport";
import {
  readIngestUploadId,
  readIngestErrorMessage,
  type IngestKind,
} from "@/lib/ingestWire";

export interface IngestTurn {
  id: string;
  fileName: string;
  kind: IngestKind;
  /** The optional note typed beside the chip. Header only — the wire has no field for it. */
  text: string;
  createdAt: number;
  phase: "uploading" | "status" | "error";
  ingestId: string | null;
  error: string | null;
  /** The upload response itself said "already processed" (level-1 dedupe). A RESULT, not an error. */
  duplicate: { message: string; ofIngestId: string | null } | null;
}

interface State {
  file: File | null;
  kind: IngestKind | null;
  turns: IngestTurn[];
  attach: (file: File) => void;
  setKind: (kind: IngestKind | null) => void;
  clearDraft: () => void;
  submit: (email: string, text: string) => Promise<void>;
}

let seq = 0;

function readDuplicate(raw: unknown): IngestTurn["duplicate"] {
  const d = (raw as { duplicate?: unknown } | null)?.duplicate;
  if (!d || typeof d !== "object") return null;
  const r = d as { message?: unknown; of_ingest_id?: unknown };
  return {
    message: typeof r.message === "string" ? r.message : "",
    ofIngestId: typeof r.of_ingest_id === "string" ? r.of_ingest_id : null,
  };
}

export const useIngestComposerStore = create<State>()((set, get) => ({
  file: null,
  kind: null,
  turns: [],
  attach: (file) => set({ file, kind: null }),
  setKind: (kind) => set({ kind }),
  clearDraft: () => set({ file: null, kind: null }),
  submit: async (email, text) => {
    const { file, kind } = get();
    if (!file || !kind) return;
    const id = `ingest-turn-${++seq}`;
    const turn: IngestTurn = {
      id,
      fileName: file.name,
      kind,
      text,
      createdAt: Date.now(),
      phase: "uploading",
      ingestId: null,
      error: null,
      duplicate: null,
    };
    set((s) => ({ turns: [turn, ...s.turns], file: null, kind: null }));
    const patch = (p: Partial<IngestTurn>) =>
      set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
    try {
      const raw = await uploadIngest(file, kind, email);
      const ingestId = readIngestUploadId(raw);
      if (!ingestId) {
        patch({ phase: "error", error: "The server's response could not be read." });
        return;
      }
      patch({ phase: "status", ingestId, duplicate: readDuplicate(raw) });
    } catch (err) {
      // 400 (bad kind), 403 (on_behalf_of mismatch), 413 (over INGEST_MAX_BYTES): plain `detail`.
      patch({ phase: "error", error: readIngestErrorMessage(err) ?? "Upload failed." });
    }
  },
}));
