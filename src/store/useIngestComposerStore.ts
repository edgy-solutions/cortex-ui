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
import { recordMyDrop } from "@/lib/myDrops";
import { inferUploadKind, type Inferred } from "@/lib/ingestKindInfer";
import {
  readIngestUploadId,
  readIngestErrorMessage,
  readIngestRefusal,
  ingestKindNotYetAccepted,
  type IngestKind,
  type IngestRefusal,
} from "@/lib/ingestWire";

export interface IngestTurn {
  id: string;
  fileName: string;
  kind: IngestKind;
  /** The optional note typed beside the chip. Header only — the wire has no field for it. */
  text: string;
  createdAt: number;
  /** `refused`: a 4xx with a readable body (the producer said no); terminal like `error`. */
  phase: "uploading" | "status" | "error" | "refused";
  ingestId: string | null;
  error: string | null;
  /** The 4xx body, when phase is `refused`. */
  refusal?: IngestRefusal | null;
  /** The upload response itself said "already processed" (level-1 dedupe). A RESULT, not an error. */
  duplicate: { message: string; ofIngestId: string | null } | null;
}

interface State {
  file: File | null;
  kind: IngestKind | null;
  /** The kind inference for the attached file; null while it is still reading the bytes (or no file). */
  inferred: Inferred | null;
  turns: IngestTurn[];
  attach: (file: File) => Promise<void>;
  setKind: (kind: IngestKind | null) => void;
  clearDraft: () => void;
  /** `owner` is the OIDC sub that keys "My drops"; null records nothing. */
  submit: (email: string, text: string, owner?: string | null) => Promise<void>;
}

let seq = 0;

function readDuplicate(raw: unknown): IngestTurn["duplicate"] {
  const d = (raw as { duplicate?: unknown } | null)?.duplicate;
  if (!d || typeof d !== "object") return null;
  const r = d as { message?: unknown; of_ingest_id?: unknown };
  return {
    message: typeof r.message === "string" ? r.message : "",
    ofIngestId: typeof r.of_ingest_id === "string" && r.of_ingest_id !== "" ? r.of_ingest_id : null,
  };
}

export const useIngestComposerStore = create<State>()((set, get) => ({
  file: null,
  kind: null,
  inferred: null,
  turns: [],
  attach: async (file) => {
    set({ file, kind: null, inferred: null });
    const inferred = await inferUploadKind(file);
    // A newer attach or a removed chip wins over a slow read.
    if (get().file !== file) return;
    // Unambiguous: the kind is set, no question asked. Ambiguous: NOTHING is selected — the
    // dropper must ask-and-answer (the picker only hints what the bytes look like).
    set({
      inferred,
      kind: inferred.ambiguous || ingestKindNotYetAccepted(inferred.kind) ? null : inferred.kind,
    });
  },
  setKind: (kind) => {
    if (kind !== null && ingestKindNotYetAccepted(kind)) return;
    set({ kind });
  },
  clearDraft: () => set({ file: null, kind: null, inferred: null }),
  submit: async (email, text, owner = null) => {
    const { file, kind } = get();
    if (!file || !kind) return;
    // Not yet accepted (cad: kind_unregistered at the door). Do not send.
    if (ingestKindNotYetAccepted(kind)) return;
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
    set((s) => ({ turns: [turn, ...s.turns], file: null, kind: null, inferred: null }));
    const patch = (p: Partial<IngestTurn>) =>
      set((s) => ({ turns: s.turns.map((t) => (t.id === id ? { ...t, ...p } : t)) }));
    try {
      // content_kind = the format: no leaf kind can be confirmed before the upload (see `uploadIngest`).
      const raw = await uploadIngest(file, kind, email, kind);
      const duplicate = readDuplicate(raw);
      if (duplicate) {
        // A duplicate is a RESULT about the ORIGINAL. Today's server answers with a fresh row id
        // (`raw.ingest_id`, status=duplicate) and the original's id in `duplicate.of_ingest_id`;
        // the fixed server will mint no row at all. Either way the turn's id is the original's,
        // its card polls the original, and `raw.ingest_id` and `raw.stage` are never read. With no
        // original id there is nothing to poll: the message alone is the result (no card, no badge).
        if (duplicate.ofIngestId) {
          recordMyDrop(owner, { ingestId: duplicate.ofIngestId, filename: file.name, droppedAt: Date.now() });
        }
        patch({ phase: "status", ingestId: duplicate.ofIngestId, duplicate });
        return;
      }
      const ingestId = readIngestUploadId(raw);
      if (!ingestId) {
        patch({ phase: "error", error: "The server's response could not be read." });
        return;
      }
      // Recorded BEFORE the patch so the re-render that shows the turn also shows the new count.
      recordMyDrop(owner, { ingestId, filename: file.name, droppedAt: Date.now() });
      patch({ phase: "status", ingestId, duplicate: null });
    } catch (err) {
      // 4xx with a readable body is the producer REFUSING the drop (400 kind_unregistered /
      // content_kind_required, 403, 413, 422): drawn as a refusal on the rail entry.
      const refusal = readIngestRefusal(err);
      if (refusal) patch({ phase: "refused", error: refusal.message, refusal });
      else patch({ phase: "error", error: readIngestErrorMessage(err) ?? "Upload failed." });
    }
  },
}));
