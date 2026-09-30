/**
 * IngestPanel — composes drop → pick kind → upload → status for one ingest at a time.
 *
 * `kind` is a REQUIRED multipart field on `POST /ingest` (invincible-agent origin/master,
 * 12d3ca6f) — there is no "awaiting kind" server state to branch on, so the flow here always
 * visits the kind picker before ever calling `uploadIngest`, rather than uploading first and
 * asking afterward the way the proposed wire did.
 *
 * Mounted behind `isIngestUiEnabled()` (see `src/components/HUD/HUD.tsx`); renders nothing
 * when the flag is off, so this file is safe to import unconditionally.
 */
import { useState } from "react";
import { useAuth } from "react-oidc-context";
import { IngestDropZone } from "./IngestDropZone";
import { KindPicker } from "./KindPicker";
import { IngestStatusCard } from "./IngestStatusCard";
import { isIngestUiEnabled } from "@/lib/ingestFlag";
import { uploadIngest } from "@/lib/ingestTransport";
import { readIngestUploadId, readIngestErrorMessage, type IngestKind } from "@/lib/ingestWire";

type Phase =
  | { step: "drop" }
  | { step: "kind"; file: File; error: string | null }
  | { step: "status"; id: string };

export function IngestPanel() {
  const auth = useAuth();
  const [phase, setPhase] = useState<Phase>({ step: "drop" });
  const [uploading, setUploading] = useState(false);

  if (!isIngestUiEnabled()) return null;

  /**
   * A COINCIDENCE, NAMED AS ONE. `on_behalf_of` must equal the caller's `authz_id` — the token
   * claim named by `USER_ENTITLEMENT_CLAIM` (default `"email"`) — and cortex is never served
   * `authz_id` directly. Sending the OIDC profile email here is correct ONLY while that default
   * holds; if a deployment sets `USER_ENTITLEMENT_CLAIM` to anything else, this sends the wrong
   * value and the gateway 403s with no way for this file to know why. The fix is Lane 1's: serve
   * `authz_id` to the client, or default `on_behalf_of` to the caller server-side when omitted.
   */
  const email = auth.user?.profile.email ?? null;

  const handleFileSelected = (file: File) => {
    setPhase({ step: "kind", file, error: null });
  };

  const handleConfirmKind = async (kind: IngestKind) => {
    if (phase.step !== "kind" || !email) return;
    const file = phase.file;
    setUploading(true);
    try {
      const raw = await uploadIngest(file, kind, email);
      const id = readIngestUploadId(raw);
      if (!id) {
        setPhase({ step: "kind", file, error: "The server's response could not be read." });
        return;
      }
      setPhase({ step: "status", id });
    } catch (err) {
      // 400 (bad kind), 403 (on_behalf_of mismatch) and 413 (over INGEST_MAX_BYTES) all carry a
      // plain-string `detail` — shown verbatim rather than translated into a generic message.
      setPhase({ step: "kind", file, error: readIngestErrorMessage(err) ?? "Upload failed." });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div data-ingest-panel>
      {phase.step === "drop" && <IngestDropZone onFileSelected={handleFileSelected} />}
      {phase.step === "kind" && (
        <>
          <KindPicker
            confirming={uploading}
            blockedReason={
              email ? null : "No verified email available — upload is disabled until one is."
            }
            onConfirm={(kind) => void handleConfirmKind(kind)}
          />
          {phase.error && (
            <p className="mt-2 text-[10px] font-mono text-rose-400" data-ingest-upload-error>
              {phase.error}
            </p>
          )}
        </>
      )}
      {phase.step === "status" && <IngestStatusCard ingestId={phase.id} />}
    </div>
  );
}
