import { Fragment, useContext, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { CheckCircle2, XCircle, FileSearch } from "lucide-react";
import { formatRequestedBy } from "@/lib/requestedBy";
import { useViewerAuthzId, viewerIsDropper } from "@/lib/dropperHold";
import { verbLabel } from "@/lib/taskDeclaration";
import { buildHeaderEdits, buildRowEdits, isPromotionRowEditsEnabled, type RowEditDraft } from "@/lib/reviewRowEdits";
import type { HeaderEdit } from "@/api/client";
import { DISPOSITIONS, presentDisposition } from "@/lib/dispositions";
import { fetchIngestExtraction } from "@/lib/ingestTransport";
import { useDocument } from "@/lib/useDocument";
import { LeafChip } from "@/components/ingest/IngestLeafChip";
import type { IngestLeaf, IngestLeafSource, IngestStatusRow } from "@/lib/ingestWire";
import {
  mergeReview,
  readExtraction,
  readPromotionHeader,
  rejectReason,
  reviewFlags,
  reviewRouteFailure,
  shaPrefix,
  type Extraction,
  type HeaderField,
  evidenceQuality,
  rowsSharingEvidence,
  headerEditComparands,
  MALFORMED_REASON_LABELS,
  type MalformedReason,
} from "@/lib/promotionReview";
import type { ApprovalTaskPayload } from "./ApprovalTaskCard";
import { useTaskAct } from "./useTaskAct";
import { ReviewExportControl } from "./ReviewExportControl";
import { isActBlocked, TaskActBlocked, TaskActNotices } from "./TaskActParts";
import { PdfEvidencePane, type PdfPaneHandle, type SourcePhase } from "./PdfEvidencePane";
import { isFeatureEnabled } from "@/lib/featureFlags";
import { buildReviewPlan, groupEnd, hitTest, nextCheck, nextUnit, placeOf, randomInGroup } from "@/lib/reviewRuns";
import { AuthContext } from "react-oidc-context";
import { runIdByUnit, useReviewCoverage, type RestoredDrafts } from "./useReviewCoverage";
import { ReviewRunsList } from "./ReviewRunsList";
import { ReviewProgress } from "./ReviewProgress";
import { ReviewCallout } from "./ReviewCallout";

/**
 * THE PROMOTION REVIEW CARD — a `document_promotion` task vetted "in a few looks" (the
 * architect's review standard, overnight directive 2026-10-17):
 *
 *   top line   notice id (the title, never the sha), kind, manufacturer, notice date, N parts,
 *              attempt, dropped_by, sha prefix
 *   left       the extracted rows: mpn, change/field, extracted_value, obtained_via, and a "show"
 *              that jumps the PDF to the row's evidence
 *   right      the source PDF, every page, scrolled to the evidence with its box outlined; row 1's on
 *              open. It pages and scrolls too, since a steward must be able to read every page.
 *   bottom     Promote / Reject (narrow codes)
 *
 * The test it is built to pass: a steward who has never seen the notice can confirm mpn + value
 * against the outlined crop for every row without scrolling the PDF by hand. `j`/`k` walk the rows
 * and the pane follows, so "every row" is one key per row.
 *
 * THE DECISION IS THE GENERIC CARD'S, NOT A COPY. `useTaskAct` is the one `/act` path, and the
 * blocked/done/refused states are `TaskActParts`, so this card cannot offer a verb the declaration
 * does not, send a reject without a reason, or claim a resume the gateway did not report.
 *
 * KEYBOARD, while the card has focus and no text field does:
 *   j / k     next / previous row
 *   [ / ]     previous / next page of the source
 *   Home / End / s   (flag `promotionRuns`, runs view) start / end of the part's group / a random part in it,
 *             unlooked first
 *   p         ARMS promote; a second p, or Enter, sends it; Esc disarms. One key is too easy to hit
 *             on a surface whose every decision is archived (ADR-0034); a click on Promote is
 *             already deliberate and sends at once.
 *   r         opens the reject codes; 1–9 picks one; Enter sends it.
 *
 * ROW EDITS (flag `VITE_PROMOTION_ROW_EDITS`, OFF by default: only exact "true" enables). A steward can fix an extracted mpn, delete a
 * row, or add a missed part before promoting; the drafts ride the promote as `row_edits` (the grouped
 * review's RowEdits shape, `buildRowEdits`) and the platform files them as an extraction_defect. The
 * checks the server would 422 on (blanks, a correction equal to its mpn, an added or corrected mpn that
 * collides with an extracted row, the same added mpn twice) run here first and hold Promote. A reject
 * sends no edits. A 503 `extraction_defect_not_filed` means the decision IS recorded and the task is
 * still pending: the editor LOCKS, so promoting again re-sends byte-identical edits, which files them.
 *
 * HEADER EDITS, same flag and same gate: a `fix` beside the notice id, manufacturer and notice date opens
 * value / evidence (prefilled with the pane's current page, `p<n>`) / reason. They ride the promote as the
 * top-level `header_edits` (wire field `mfr` for the manufacturer), are compared against the EXTRACTED
 * value (not the task payload's, which the top line prefers), and count toward "Promote with N edits".
 * The mfr is compared only when `notice.mfr_source` is "header" (`headerEditComparands`): when the
 * header was blank, `notice.mfr` is the notice_identity FALLBACK, shown as "(from identity, header
 * blank)", and a steward value equal to it fills the missing field, which the server accepts.
 * The topline's kind is the extraction's leaf (PCN or PDN) when it names one.
 *
 * CHIP RULE: bordered means clickable. Kind, codes and every fact on the top line are muted text.
 *
 * DATA: the top line from the task payload (193's header) and `GET /ingest/{id}/extraction`,
 * merged by `mergeReview`; the rows from the extraction alone; the PDF from `/source`. Each of the
 * two fetches fails on its own and says why.
 *
 * PROMOTE IS OFFERED ONLY ON WHAT THE STEWARD CAN SEE (the architect, 2026-10-17, after rows
 * fa231498 and 0096a523 sat in bob's queue with no rows and an unrenderable source): at least one
 * row drawn AND a page of the source drawn. That is the safe set, enumerated: a phase this card
 * does not know holds Promote rather than passing it. Reject waits on neither, because "this is not
 * a notice" is exactly the decision a steward makes about a drop with no rows or no readable source.
 */
type PromoteHold = "rows-loading" | "no-rows" | "source-loading" | "no-source" | "sent-back" | "dropper" | "unchecked";

const HOLD_TEXT: Record<PromoteHold, string> = {
  "rows-loading": "Promote waits for the extracted rows.",
  "no-rows": "Promote is off: there are no extracted rows to vet. Reject is still open.",
  "source-loading": "Promote waits for the source to draw.",
  "no-source": "Promote is off: the source cannot be shown, and a steward cannot vet what they cannot see. Reject is still open.",
  // Unlike the holds above this one also turns Reject off: see `sentBack` in the card.
  "sent-back": "",
  // Known from the payload alone; the server refuses promoted from the dropper (dropper_cannot_attest_origin).
  dropper: "Promote is off: you dropped this document, and someone else must attest its origin. Reject is still open.",
  // Flag `promotionRuns` only; the text names the counts, so the card composes it (`uncheckedText`).
  unchecked: "",
};
/** The packet that proposes recording coverage on the wire; the preview names it so nobody mistakes it for shipped. */
const COVERAGE_PACKET = "sessions/2026-10-28-packet-to-lane-01-from-cortex-promotion-review-at-scale-a-saved-draft-and-a-coverage-key.md";
const emptyDraft = (): RowEditDraft => ({ deleted: {}, addedMpns: [], corrected: {}, overrides: {}, addedEvidence: {}, correctedEvidence: {} });
/** A saved draft is applied only if it has every part of the shape the editor reads; anything else is dropped whole. */
function isRowEditDraft(v: unknown): v is RowEditDraft {
  if (!isObj(v)) return false;
  return (
    Array.isArray(v.addedMpns) &&
    isObj(v.deleted) &&
    isObj(v.corrected) &&
    isObj(v.overrides) &&
    isObj(v.addedEvidence) &&
    isObj(v.correctedEvidence)
  );
}
/** One hold, three causes: the kind sent the document back, a re-class superseded this task, or the server said stale. */
type ReviewHold = { leaf: IngestLeaf | null; cause: "sent-back" | "superseded" | "stale"; newTaskId: string | null };
/** The served evidence_ref, verbatim, for the malformed banner: JSON, cut at 240 characters. */
const sampleText = (raw: unknown): string => {
  const t = JSON.stringify(raw) ?? String(raw);
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
};

const sentBackText = (h: ReviewHold): string => {
  const LEAF = h.leaf ? h.leaf.toUpperCase() : "?";
  if (h.cause === "stale") {
    return h.newTaskId
      ? `This review is stale. Review ${h.newTaskId} replaces it and appears as its own card; Promote and Reject are off here.`
      : "This review is stale: the document is being extracted again, and a new review will replace this one. Promote and Reject are off here.";
  }
  if (h.cause === "superseded" && h.newTaskId) {
    return `The kind changed to ${LEAF}. Review ${h.newTaskId} replaces this one and appears as its own card; Promote and Reject are off here.`;
  }
  return `The kind changed to ${LEAF}: the document went back to extraction for the new kind. A new review replaces this one; Promote and Reject are off here.`;
};
type ExtractionPhase = { phase: "loading" } | { phase: "ready"; ex: Extraction } | { phase: "failed"; why: string };

const HEADER_LABEL: Record<HeaderField, string> = {
  notice_id: "notice id",
  manufacturer: "manufacturer",
  notice_date: "notice date",
  attempt: "attempt",
  part_count: "part count",
};

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

type HeaderDraft = Partial<Record<HeaderEdit["field"], { value: string; evidence_ref: string; reason: string }>>;
const HEADER_FIELDS: ReadonlyArray<HeaderEdit["field"]> = ["notice_id", "mfr", "notice_date"];
const EDIT_BTN =
  "px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-300 hover:bg-amber-500/10 text-[9px] uppercase tracking-widest cursor-pointer disabled:opacity-40";
const EDIT_INPUT =
  "px-2 py-1 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600 disabled:opacity-40";

/** The "add a missed part" form and the list of what has been added. Drafts go through the card's RowEditDraft. */
function RowAddForm({
  disabled,
  draft,
  setDraft,
}: {
  disabled: boolean;
  draft: RowEditDraft;
  setDraft: (f: (d: RowEditDraft) => RowEditDraft) => void;
}) {
  const [mpn, setMpn] = useState("");
  const [disposition, setDisposition] = useState<(typeof DISPOSITIONS)[number]>(DISPOSITIONS[0]);
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState("");
  const m = mpn.trim();
  const dup = draft.addedMpns.includes(m);
  const ready = m !== "" && reason.trim() !== "" && evidence.trim() !== "" && !dup;
  const add = () => {
    if (!ready) return;
    setDraft((d) => ({
      ...d,
      addedMpns: [...d.addedMpns, m],
      overrides: { ...d.overrides, [m]: { disposition, reason: reason.trim() } },
      addedEvidence: { ...d.addedEvidence, [m]: evidence.trim() },
    }));
    setMpn("");
    setReason("");
    setEvidence("");
  };
  return (
    <div className="mt-2 rounded border border-white/5 px-2 py-1.5" data-row-add-form>
      <p className="text-[9px] font-mono uppercase tracking-widest text-slate-500 mb-1">add a missed part</p>
      <div className="flex flex-wrap gap-1.5">
        <input value={mpn} disabled={disabled} onChange={(e) => setMpn(e.target.value)} placeholder="mpn" aria-label="Added mpn" data-add-mpn className={EDIT_INPUT} />
        <select
          value={disposition}
          disabled={disabled}
          onChange={(e) => setDisposition(e.target.value as (typeof DISPOSITIONS)[number])}
          aria-label="Added disposition"
          data-add-disposition
          className={EDIT_INPUT}
        >
          {DISPOSITIONS.map((d) => (
            <option key={d} value={d}>
              {presentDisposition(d).label}
            </option>
          ))}
        </select>
        <input value={reason} disabled={disabled} onChange={(e) => setReason(e.target.value)} placeholder="reason" aria-label="Added reason" data-add-reason className={EDIT_INPUT} />
        <input value={evidence} disabled={disabled} onChange={(e) => setEvidence(e.target.value)} placeholder="evidence" aria-label="Added evidence" data-add-evidence className={EDIT_INPUT} />
        <button type="button" disabled={disabled || !ready} onClick={add} className={EDIT_BTN} data-row-add>
          add
        </button>
      </div>
      {draft.addedMpns.length > 0 && (
        <ul className="mt-1 space-y-0.5 text-[11px] font-mono text-slate-300">
          {draft.addedMpns.map((p) => (
            <li key={p} className="flex items-center gap-2" data-row-added={p}>
              <span>
                + {p} · {presentDisposition(draft.overrides[p].disposition as (typeof DISPOSITIONS)[number]).label} · {draft.addedEvidence[p]}
              </span>
              <button
                type="button"
                disabled={disabled}
                onClick={() =>
                  setDraft((d) => {
                    const { [p]: _o, ...overrides } = d.overrides;
                    const { [p]: _e, ...addedEvidence } = d.addedEvidence;
                    return { ...d, addedMpns: d.addedMpns.filter((x) => x !== p), overrides, addedEvidence };
                  })
                }
                className={EDIT_BTN}
                data-row-undo={p}
              >
                undo
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function PromotionReviewCard({ task, ingestId }: { task: ApprovalTaskPayload; ingestId: string }) {
  const a = useTaskAct(task);
  const { acting, act, verbs, needsReason } = a;
  // The store's row for this drop (registered with the one poller if absent). The chip draws its
  // real stage; "review" below is the fallback ONLY for a row not yet read.
  const { row: docRow } = useDocument(ingestId);
  const [sel, setSel] = useState(0);
  const [jumpKey, setJumpKey] = useState(0);
  const [armed, setArmed] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const editsOn = isPromotionRowEditsEnabled();
  const [headerDraft, setHeaderDraft] = useState<HeaderDraft>({});
  const [draft, setDraft] = useState<RowEditDraft>(emptyDraft);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const paneRef = useRef<PdfPaneHandle | null>(null);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);
  const [extraction, setExtraction] = useState<ExtractionPhase>({ phase: "loading" });
  const [sourcePhase, setSourcePhase] = useState<SourcePhase>("loading");
  // A pick through the chip answers with the new status row. Still at `review`: only the chip's
  // leaf/source/corrected_by change. Anywhere else (the server sent the row back to `extracting`
  // because the kind changed after parts extraction): this review is stale, see `sentBack`.
  const [leafPick, setLeafPick] = useState<{ leaf: IngestLeaf | null; source: IngestLeafSource | null; by: string | null } | null>(null);
  const [sentBackTo, setSentBackTo] = useState<ReviewHold | null>(null);
  const onLeafRow = (row: IngestStatusRow) => {
    setLeafPick({ leaf: row.leaf ?? null, source: row.leaf_source ?? null, by: row.corrected_by ?? null });
    if (row.superseded_task_id === task.task_id) {
      // 204's re-class: this task is replaced, even when the stage is still `review`.
      setSentBackTo({ leaf: row.leaf ?? null, cause: "superseded", newTaskId: row.task_id ?? null });
    } else if (row.stage !== "review") {
      setSentBackTo({ leaf: row.leaf ?? null, cause: "sent-back", newTaskId: null });
    }
  };

  useEffect(() => {
    let live = true;
    setExtraction({ phase: "loading" });
    fetchIngestExtraction(ingestId)
      .then((body) => {
        if (!live) return;
        const ex = readExtraction(body);
        setExtraction(ex ? { phase: "ready", ex } : { phase: "failed", why: "The extraction answered, but with no rows array to draw." });
      })
      .catch((err) => {
        if (live) setExtraction({ phase: "failed", why: reviewRouteFailure(err, "extraction") });
      });
    return () => {
      live = false;
    };
  }, [ingestId]);

  const payload = isObj(task.payload) ? task.payload : {};
  const droppedBy = isObj(payload.dropped_by) ? str(payload.dropped_by.authz_id) : str(payload.dropped_by);
  const header = useMemo(() => readPromotionHeader(task.payload), [task.payload]);
  const ex = extraction.phase === "ready" ? extraction.ex : null;
  const review = useMemo(() => mergeReview(header, ex), [header, ex]);
  const sha = ingestId;
  const flags = reviewFlags(review);
  const rows = review.rows;
  // A row that inherits the document-level date AND has a box to qualify. One predicate for the row's via cell and the
  // header note, so the note's count is the number of rows that say doc_level.
  const isDocLevel = (r: (typeof rows)[number]) =>
    r.evidence.state === "ok" && r.evidence.ref.bbox !== null && evidenceQuality(r.obtained_via) === "inherited";
  const docLevelRows = rows.filter(isDocLevel);
  const docLevelFields = [...new Set(docLevelRows.map((r) => r.field ?? "the date"))];
  // FLAG `promotionRuns`: parts folded into runs, with coverage. Off, `plan` is null and every branch below
  // that mentions it falls through to the card as it was.
  const runsOn = isFeatureEnabled("promotionRuns");
  // The seed is the document and attempt, never the clock: a resumed review walks the same sampled checks.
  const plan = useMemo(
    () => (runsOn && rows.length > 0 ? buildReviewPlan(rows, `${ingestId}:${review.attempt ?? ""}`) : null),
    [runsOn, rows, ingestId, review.attempt],
  );
  // Read the auth context WITHOUT useAuth (which throws outside a provider). No sub, no owner: coverage is then not persisted (a no-auth dev build has no identity to key it by).
  const sub = useContext(AuthContext)?.user?.profile?.sub ?? null;
  const owner = sub ?? null;
  const cov = useReviewCoverage({
    enabled: plan !== null,
    owner,
    taskId: task.task_id,
    ingestId,
    attempt: review.attempt,
    draft,
    headerDraft,
    sel,
    onRestore: (saved: RestoredDrafts | null) => {
      if (saved === null) {
        setDraft(emptyDraft());
        setHeaderDraft({});
        setSel(0);
        return;
      }
      if (isRowEditDraft(saved.draft)) setDraft(saved.draft);
      if (isObj(saved.headerDraft)) setHeaderDraft(saved.headerDraft as HeaderDraft);
      if (typeof saved.sel === "number" && Number.isInteger(saved.sel) && saved.sel >= 0) setSel(saved.sel);
    },
  });
  const runOf = useMemo(() => (plan ? runIdByUnit(plan) : new Map<number, string>()), [plan]);
  const selUnit = plan ? (plan.unitOfRow[sel] ?? 0) : -1;
  const planLooked = plan ? plan.units.filter((u) => cov.looked.has(u.id)).length : 0;
  const checksLeft = plan ? [...plan.checks].filter((u) => !cov.looked.has(plan.units[u].id)).length : 0;
  // A fact whose rows all state ONE value is confirmed once; one whose rows disagree cannot be, and says so.
  const unconfirmedFacts = plan ? plan.sharedFacts.filter((f) => f.values.length === 1 && !cov.confirmed.has(f.key)) : [];
  const uncheckedText =
    plan && (checksLeft > 0 || unconfirmedFacts.length > 0)
      ? `${checksLeft} checks not looked at yet${
          unconfirmedFacts.length > 0
            ? `; the shared ${[...new Set(unconfirmedFacts.map((f) => f.field ?? "fact"))].join(", ")} not confirmed`
            : ""
        }. Shift+J walks them.`
      : null;
  const runsView = runsOn && plan !== null && cov.view === "runs";
  const selected = rows[sel] ?? null;
  const target = selected && selected.evidence.state === "ok" ? selected.evidence.ref : null;
  const targetQuality = selected ? evidenceQuality(selected.obtained_via) : "unknown";
  const targetShared = target ? rowsSharingEvidence(rows, target) : 0;

  const blocked = isActBlocked(a);
  // WHY sent-back disables Reject too (the other holds leave it open): once the row has left review
  // the task is stale; any decision recorded on it would be a decision on a review that no longer exists.
  const hold: ReviewHold | null =
    sentBackTo ??
    (a.refusal?.code === "stale_extraction" ? { leaf: null, cause: "stale", newTaskId: a.refusal.newTaskId ?? null } : null);
  const sentBack = hold !== null;
  const canAct = !blocked && !acting && !sentBack;
  const promoteVerb = verbs.includes("promoted") ? "promoted" : null;
  const rejectVerb = verbs.includes("rejected") ? "rejected" : null;
  const otherVerbs = verbs.filter((v) => v !== promoteVerb && v !== rejectVerb);
  const viewerAuthzId = useViewerAuthzId();
  const dropperHeld = viewerIsDropper(task.payload, viewerAuthzId);
  const promoteHold: PromoteHold | null =
    sentBack
      ? "sent-back"
      : dropperHeld
      ? "dropper"
      : extraction.phase === "loading"
      ? "rows-loading"
      : rows.length === 0
        ? "no-rows"
        : sourcePhase === "ready"
          ? // STRICTER, never looser: evaluated after every existing hold, so one of those still wins.
            uncheckedText !== null
            ? "unchecked"
            : null
          : sourcePhase === "loading"
            ? "source-loading"
            : "no-source";
  const locked = a.refusal?.code === "extraction_defect_not_filed";
  const editsActive = editsOn && promoteVerb !== null;
  const headerCount = editsActive ? Object.keys(headerDraft).length : 0;
  const rowCount = editsActive
    ? Object.keys(draft.deleted).length +
      draft.addedMpns.length +
      Object.keys(draft.corrected).filter((m) => !draft.deleted[m]).length
    : 0;
  const editCount = rowCount + headerCount;
  // A part is EDITED when its mpn is corrected or deleted in the draft (drafts are keyed by mpn).
  const editedUnits = useMemo(() => {
    const out = new Set<number>();
    if (!plan || !editsActive) return out;
    plan.units.forEach((u, i) => {
      if (draft.deleted[u.mpn] || Object.hasOwn(draft.corrected, u.mpn)) out.add(i);
    });
    return out;
  }, [plan, editsActive, draft]);
  const extractedHeader = headerEditComparands(ex);
  const mfrFallback = ex?.manufacturer_source === "identity" && ex.manufacturer !== null ? ex.manufacturer : null;
  // The server's checks, mirrored so the steward sees them before the wire. Matching is case-insensitive.
  const problems = useMemo(() => {
    if (!editsActive) return [];
    const out: string[] = [];
    const norm = (v: string) => v.trim().toLowerCase();
    const extracted = new Set(rows.map((r) => norm(r.mpn)));
    const seenAdded = new Set<string>();
    for (const m of draft.addedMpns) {
      if (extracted.has(norm(m))) out.push(`added ${m} collides with an extracted row`);
      if (seenAdded.has(norm(m))) out.push(`added ${m} appears twice`);
      seenAdded.add(norm(m));
    }
    for (const [m, to] of Object.entries(draft.corrected)) {
      if (draft.deleted[m] || norm(to) === "") continue;
      if (norm(to) === norm(m)) out.push(`corrected ${m} equals its mpn`);
      else if (extracted.has(norm(to))) out.push(`corrected ${m} -> ${to} collides with an extracted row`);
    }
    try {
      buildRowEdits(draft);
    } catch (e) {
      out.push(String((e as Error).message).replace(/^row_edits incomplete: /, "blank: "));
    }
    try {
      buildHeaderEdits(headerDraft, extractedHeader);
    } catch (e) {
      out.push(String((e as Error).message).replace(/^header_edits incomplete: /, "header: "));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editsActive, draft, rows, headerDraft, ex]);
  const canPromote = canAct && promoteVerb !== null && promoteHold === null && problems.length === 0;

  useEffect(() => {
    rowRefs.current[sel]?.scrollIntoView?.({ block: "nearest" });
    // `runsView` too: coming back to the table from the runs list must bring the selected row into view.
  }, [sel, runsView]);

  const startHeaderFix = (wire: HeaderEdit["field"]) =>
    setHeaderDraft((h) => ({
      ...h,
      [wire]: { value: "", evidence_ref: `p${paneRef.current?.page() ?? 1}`, reason: "" },
    }));
  const undoHeader = (wire: HeaderEdit["field"]) =>
    setHeaderDraft((h) => {
      const { [wire]: _x, ...rest } = h;
      return rest;
    });
  const setHeaderField = (wire: HeaderEdit["field"], k: "value" | "evidence_ref" | "reason", v: string) =>
    setHeaderDraft((h) => (h[wire] ? { ...h, [wire]: { ...h[wire]!, [k]: v } } : h));
  /** A header value on the title line: the shown value, struck through to the drafted one, and its fix / undo. */
  const headerValue = (field: HeaderEdit["field"], shown: string) => {
    const d = editsActive ? headerDraft[field] : undefined;
    return (
      <>
        {d ? (
          <>
            <span className="line-through text-slate-500">{shown}</span>
            <span className="text-cyan-300" data-header-corrected={field}> {d.value || "…"}</span>
          </>
        ) : (
          shown
        )}
        {editsActive && (
          <button
            type="button"
            disabled={locked}
            onClick={() => (d ? undoHeader(field) : startHeaderFix(field))}
            // The label is drawn by CSS, so the title line's text stays the value alone.
            className={`ml-1 ${EDIT_BTN} ${d ? "after:content-['undo']" : "after:content-['fix']"}`}
            aria-label={`${d ? "Undo the correction of" : "Correct"} ${field}`}
            {...(d ? { "data-header-undo": field } : { "data-header-fix": field })}
          />
        )}
      </>
    );
  };
  const headerForm = (field: HeaderEdit["field"]) => {
    const d = headerDraft[field]!;
    const was = extractedHeader[field];
    return (
      <div className="mt-1 flex flex-wrap items-center gap-1.5" data-header-form={field}>
        <span className="text-[10px] font-mono text-slate-500" data-header-extracted={field}>
          {field === "mfr" && mfrFallback !== null
            ? `mfr: ${mfrFallback} (from identity, header blank)`
            : `${field} extracted: ${was ?? "—"}`}
        </span>
        <input value={d.value} disabled={locked} onChange={(e) => setHeaderField(field, "value", e.target.value)} placeholder="value" aria-label={`Corrected ${field}`} data-header-value={field} className={EDIT_INPUT} />
        <input value={d.evidence_ref} disabled={locked} onChange={(e) => setHeaderField(field, "evidence_ref", e.target.value)} placeholder="evidence" aria-label={`Evidence for ${field}`} data-header-evidence={field} className={EDIT_INPUT} />
        <input value={d.reason} disabled={locked} onChange={(e) => setHeaderField(field, "reason", e.target.value)} placeholder="reason" aria-label={`Reason for ${field}`} data-header-reason={field} className={EDIT_INPUT} />
      </div>
    );
  };

  // Several rows share one mpn (one per change field): the edit controls sit on the FIRST of each.
  const firstOfMpn = useMemo(() => {
    const seen = new Set<string>();
    const out = new Set<number>();
    rows.forEach((r, i) => {
      if (!seen.has(r.mpn)) {
        seen.add(r.mpn);
        out.add(i);
      }
    });
    return out;
  }, [rows]);
  const startFix = (mpn: string, evidence: string) =>
    setDraft((d) => ({
      ...d,
      corrected: { ...d.corrected, [mpn]: "" },
      correctedEvidence: { ...d.correctedEvidence, [mpn]: evidence },
    }));
  const undoRow = (mpn: string) =>
    setDraft((d) => {
      const { [mpn]: _d, ...deleted } = d.deleted;
      const { [mpn]: _c, ...corrected } = d.corrected;
      const { [mpn]: _e, ...correctedEvidence } = d.correctedEvidence;
      return { ...d, deleted, corrected, correctedEvidence };
    });

  /** Selecting a row, by ANY path, means the steward is looking at its part: mark it, and open its run. */
  const look = (i: number) => {
    if (!plan) return;
    const u = plan.unitOfRow[i];
    if (u === undefined) return;
    cov.markLooked(plan.units[u].id);
    const run = runOf.get(u);
    if (run) cov.openRun(run);
  };
  const select = (i: number) => {
    setSel(i);
    setJumpKey((k) => k + 1);
    rootRef.current?.focus({ preventScroll: true });
    look(i);
  };
  const selectUnit = (u: number) => select(plan!.units[u].primary);
  const stepUnit = (dir: 1 | -1) => plan && selectUnit(nextUnit(plan, selUnit, dir));
  const stepCheck = (dir: 1 | -1) => {
    if (!plan) return;
    const u = nextCheck(plan, selUnit, dir, cov.looked);
    if (u !== null) selectUnit(u);
  };
  const jumpGroup = (which: "start" | "end") => {
    if (!plan) return;
    const u = groupEnd(plan, selUnit, which);
    if (u !== null) selectUnit(u);
  };
  const randomGroup = () => {
    if (!plan) return;
    const u = randomInGroup(plan, selUnit, cov.looked, Math.random);
    if (u !== null) selectUnit(u);
  };
  const stepRow = (dir: 1 | -1) => select(Math.min(Math.max(sel + dir, 0), Math.max(rows.length - 1, 0)));
  /** A click on the page: the smallest drawn box under it, else nothing moves. */
  const onPagePoint = (page: number, fx: number, fy: number) => {
    const hit = hitTest(rows, page, fx, fy);
    if (hit !== null) select(hit);
  };
  const move = (d: number) => setSel((s) => Math.min(Math.max(s + d, 0), Math.max(rows.length - 1, 0)));

  const promote = () => {
    if (!canPromote || !promoteVerb) return;
    setArmed(false);
    void act(
      promoteVerb,
      note,
      rowCount > 0 ? buildRowEdits(draft) : undefined,
      headerCount > 0 ? buildHeaderEdits(headerDraft, extractedHeader) : undefined,
    );
  };
  const reject = () => {
    if (!canAct || !rejectVerb || !code) return;
    void act(rejectVerb, rejectReason(code, note));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement;
    const typing = el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable;
    if (e.key === "Escape") {
      if (!armed && !rejectOpen) return;
      setArmed(false);
      setRejectOpen(false);
      e.preventDefault();
      return;
    }
    if (typing) return;
    // FLAG `promotionRuns`: j/k and the arrows walk PARTS in the runs view, rows in the table view; Shift jumps
    // to the next / previous check not yet looked at. Every other key falls through unchanged.
    if (runsOn && plan && (e.key === "j" || e.key === "J" || e.key === "k" || e.key === "K" || e.key === "ArrowDown" || e.key === "ArrowUp")) {
      const dir = e.key === "j" || e.key === "J" || e.key === "ArrowDown" ? 1 : -1;
      if (!runsView) stepRow(dir);
      else if (e.shiftKey || e.key === "J" || e.key === "K") stepCheck(dir);
      else stepUnit(dir);
      e.preventDefault();
      return;
    }
    if (runsOn && plan && runsView && (e.key === "Home" || e.key === "End" || e.key === "s")) {
      if (e.key === "s") randomGroup();
      else jumpGroup(e.key === "Home" ? "start" : "end");
      e.preventDefault();
      return;
    }
    if (e.key === "j") move(1);
    else if (e.key === "k") move(-1);
    else if (e.key === "[") paneRef.current?.step(-1);
    else if (e.key === "]") paneRef.current?.step(1);
    else if (e.key === "p" && canPromote) {
      setRejectOpen(false);
      if (armed) promote();
      else setArmed(true);
    } else if (e.key === "r" && canAct && rejectVerb) {
      setArmed(false);
      setRejectOpen(true);
    } else if (rejectOpen && /^[1-9]$/.test(e.key) && review.rejectCodes[Number(e.key) - 1]) {
      setCode(review.rejectCodes[Number(e.key) - 1].code);
    } else if (e.key === "Enter" && el === rootRef.current && armed) promote();
    else if (e.key === "Enter" && el === rootRef.current && rejectOpen && code) reject();
    else return;
    e.preventDefault();
  };

  const topline: Array<[string, string]> = [
    ["kind", ""],
    // The identity fallback is labelled as one, but only when it is what the top line shows (the payload's value wins).
    ["manufacturer", review.manufacturer === null ? "—" : review.manufacturer === mfrFallback ? `${review.manufacturer} (from identity, header blank)` : review.manufacturer],
    ["notice-date", review.notice_date ?? "—"],
    ["parts", `${review.part_count ?? "?"} parts`],
    ["attempt", `attempt ${review.attempt ?? "?"}`],
    ["dropped-by", `dropped by ${droppedBy ?? "—"}`],
  ];

  // The card also renders a task already decided (the status line below says so); a leaf change there would
  // re-route a document whose review is over, and after a send-back this task no longer reviews anything.
  const chipLocked = a.done !== null || (task.task_state != null && task.task_state !== "pending") || sentBack;
  const chipLeaf = leafPick ? leafPick.leaf : (ex?.leaf ?? null);
  const chipSource = leafPick ? leafPick.source : (ex?.leaf_source ?? null);
  const chipBy = leafPick ? leafPick.by : (ex?.corrected_by ?? null);
  const kindTitle = !chipLeaf
    ? "PCN or PDN: the extraction did not name it (a defaulted doc_type is not shown)"
    : chipSource === "declared"
      ? "declared at the drop"
      : chipSource === "title"
        ? "read from the document's title"
        : chipSource === "corrected"
          ? chipBy
            ? `corrected by ${chipBy}`
            : "corrected"
          : "source not given";

  return (
    <div
      ref={rootRef}
      tabIndex={0}
      onKeyDown={onKeyDown}
      className="glass-panel p-5 my-4 border-cyan-500/20 outline-none focus-visible:ring-1 focus-visible:ring-cyan-400/40"
      data-promotion-review
      data-leaf-sent-back={sentBack ? "" : undefined}
      data-review-replaced-by={hold?.newTaskId ?? undefined}
      aria-label={`Review ${review.notice_id ?? "document"}: j and k move between rows, p promotes, r rejects`}
    >
      {/* TOP LINE. The notice id is the title; the sha never is (it sits in the provenance line). */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <FileSearch className="w-4 h-4 text-neon-pink shrink-0" />
          <h3 className="text-lg font-bold text-white tracking-tight leading-none flex-1 break-all" data-review-title>
            {headerValue("notice_id", review.notice_id ?? "Document promotion")}
          </h3>
          <span className="text-[9px] font-mono uppercase tracking-widest text-slate-400" data-review-state>
            {a.done ? (a.done.resumed ? verbLabel(a.done.decision) : "recorded") : (task.task_state ?? "pending")}
          </span>
        </div>
        <p className="text-[11px] font-mono text-slate-300" data-review-topline>
          {topline.map(([k, v], i) => (
            <span key={k} data-topline={k} title={k === "kind" ? kindTitle : undefined}>
              {i > 0 && <span className="text-slate-600"> · </span>}
              {k === "kind" ? (
                <LeafChip
                  ingestId={ingestId}
                  stage={docRow?.stage ?? "review"}
                  leaf={chipLeaf}
                  leafSource={chipSource}
                  correctedBy={chipBy}
                  locked={chipLocked}
                  onRow={onLeafRow}
                />
              ) : k === "manufacturer" || k === "notice-date" ? (
                headerValue(k === "manufacturer" ? "mfr" : "notice_date", v)
              ) : (
                v
              )}
            </span>
          ))}
          {sha && (
            <span data-topline="sha" title={sha}>
              <span className="text-slate-600"> · </span>
              {shaPrefix(sha)}
            </span>
          )}
        </p>
        {docLevelRows.length > 0 && (
          <p className="mt-1 text-[10px] font-mono text-violet-300/70" data-review-inherited-note>
            {docLevelFields.join(", ")} inherited from the document-level date ({docLevelRows.length} {docLevelRows.length === 1 ? "row" : "rows"})
          </p>
        )}
        {editsActive &&
          HEADER_FIELDS.map((wire) =>
            headerDraft[wire] ? (
              <Fragment key={wire}>{headerForm(wire)}</Fragment>
            ) : null,
          )}
        <p className="mt-1 text-[10px] font-mono text-slate-500 break-all" data-review-provenance>
          {sha}
          {task.requested_by && <> · requested by {formatRequestedBy(task.requested_by)}</>}
          {" · "}
          {task.audience}
        </p>
      </div>

      {/* FLAGS — each a separate fact with a separate owner (promotionReview.ts). Muted, not chips. */}
      {((review.notice_id === null && extraction.phase !== "loading") ||
        review.headerConflicts.length > 0 ||
        (flags &&
          (flags.absentEvidence > 0 ||
            flags.malformedEvidence > 0 ||
            flags.partsMismatch ||
            flags.partsUnknown ||
            flags.evidenceCountMismatch ||
            flags.regionEvidence > 0 ||
            flags.unknownMethod > 0 ||
            (ex?.droppedRows ?? 0) > 0))) && (
        <ul className="mb-3 space-y-0.5 text-[11px] text-amber-400/90" data-review-flags>
          {review.notice_id === null && extraction.phase !== "loading" && (
            <li data-review-flag="no-notice-id">The notice id did not travel, so the title cannot name the notice.</li>
          )}
          {review.headerConflicts.length > 0 && (
            <li data-review-flag="header-conflict">
              The task and its extraction disagree on {review.headerConflicts.map((k) => HEADER_LABEL[k]).join(", ")}. The
              top line shows the task's.
            </li>
          )}
          {flags && flags.evidenceCountMismatch && (
            <li data-review-flag="evidence-count-mismatch">
              The extraction counts {flags.evidenceCountMismatch.served} row
              {flags.evidenceCountMismatch.served === 1 ? "" : "s"} without evidence; {flags.evidenceCountMismatch.drawn} drawn
              here have none.
            </li>
          )}
          {flags && flags.absentEvidence > 0 && (
            <li data-review-flag="absent-evidence">
              {flags.absentEvidence} row{flags.absentEvidence === 1 ? "" : "s"} carry no evidence_ref: nothing to check
              against (a corpus-gate miss).
            </li>
          )}
          {flags && flags.malformedEvidence > 0 && (
            <li data-review-flag="malformed-evidence">
              {flags.malformedEvidence} row{flags.malformedEvidence === 1 ? "" : "s"} carry an evidence_ref that cannot be read:{" "}
              {(Object.entries(flags.malformedByReason) as [MalformedReason, number][])
                .sort((a, b) => b[1] - a[1])
                .map(([code, n], i) => (
                  <span key={code} data-review-flag-reason={code} data-count={n}>
                    {i > 0 ? "; " : ""}
                    {n} {MALFORMED_REASON_LABELS[code]}
                  </span>
                ))}
              .
            </li>
          )}
          {flags && flags.malformedSample && (
            <li data-review-flag="malformed-evidence-sample">
              First unreadable evidence_ref: <code>{sampleText(flags.malformedSample.raw)}</code>
            </li>
          )}
          {flags?.partsMismatch && (
            <li data-review-flag="parts-mismatch">
              The notice declares {flags.partsMismatch.declared} parts; the rows name {flags.partsMismatch.drawn}.
            </li>
          )}
          {flags?.partsUnknown && (
            <li data-review-flag="parts-unknown">part_count did not travel, so the table cannot be shown to be whole.</li>
          )}
          {flags && flags.regionEvidence > 0 && (
            <li data-review-flag="region-evidence">
              {flags.regionEvidence} row{flags.regionEvidence === 1 ? "'s" : "s'"} outline is the whole table box, not the cell:
              find the row inside it.
            </li>
          )}
          {flags && flags.unknownMethod > 0 && (
            <li data-review-flag="unknown-method">
              {flags.unknownMethod} row{flags.unknownMethod === 1 ? "" : "s"} came by a method this card does not know; their
              outline is not claimed to be the cell.
            </li>
          )}
          {ex && ex.droppedRows > 0 && (
            <li data-review-flag="dropped-rows">
              {ex.droppedRows} row{ex.droppedRows === 1 ? "" : "s"} had no mpn and are not drawn.
            </li>
          )}
        </ul>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        {/* LEFT — the extracted rows. */}
        <div className="min-w-0">
          {runsOn && plan && (
            <>
              {cov.resumed && (
                <p className="mb-2 flex items-center gap-2 text-[11px] font-mono text-cyan-300/90" data-review-resumed={cov.resumed.looked}>
                  <span>Resumed: {cov.resumed.looked} parts looked at, saved in this browser only.</span>
                  <button type="button" onClick={cov.startOver} className={EDIT_BTN} data-review-start-over>
                    start over
                  </button>
                </p>
              )}
              <ReviewProgress
                looked={planLooked}
                left={checksLeft}
                covered={plan.units.length - planLooked - checksLeft}
                edited={editedUnits.size}
              />
              {plan.sharedFacts.map((f) => {
                const done = cov.confirmed.has(f.key);
                return (
                  <p
                    key={f.key}
                    className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-slate-400"
                    data-shared-fact={f.key}
                    data-shared-confirmed={done ? "" : undefined}
                  >
                    <span>
                      {f.field ?? "value"} <span className="text-slate-200">{f.values.join(", ")}</span> · inherited from one crop on p{f.ref.page} · {f.rows.length} rows
                    </span>
                    <button
                      type="button"
                      onClick={() => select(f.rows[0])}
                      className="px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-[9px] uppercase tracking-widest cursor-pointer"
                      data-shared-show
                    >
                      show
                    </button>
                    {f.values.length > 1 ? (
                      <span className="text-amber-400" data-shared-disagree>
                        the rows citing this crop disagree: {f.values.join(", ")}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => cov.toggleConfirmed(f.key)}
                        aria-pressed={done}
                        className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-widest cursor-pointer ${
                          done ? "border-cyan-500/40 text-cyan-300 bg-cyan-500/10" : "border-amber-500/40 text-amber-300 hover:bg-amber-500/10"
                        }`}
                        data-shared-confirm
                      >
                        {done ? "✓ confirmed" : "confirm once"}
                      </button>
                    )}
                  </p>
                );
              })}
              <div className="mb-2 inline-flex rounded border border-white/10 text-[9px] font-mono uppercase tracking-widest" data-view-toggle={cov.view}>
                {(["runs", "rows"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => cov.setView(v)}
                    aria-pressed={cov.view === v}
                    className={`px-2 py-0.5 cursor-pointer ${cov.view === v ? "bg-cyan-500/10 text-cyan-300" : "text-slate-500 hover:text-slate-300"}`}
                    data-view={v}
                  >
                    {v === "rows" ? "all rows" : "runs"}
                  </button>
                ))}
              </div>
            </>
          )}
          {extraction.phase === "loading" && (
            <p className="px-2 py-3 text-[11px] text-slate-500" data-extraction-state="loading">
              loading extraction…
            </p>
          )}
          {extraction.phase === "failed" && (
            <p className="px-2 py-3 text-[11px] text-amber-400/90" role="alert" data-extraction-failed>
              {extraction.why} There are no rows to vet against the source.
            </p>
          )}
          {ex && ex.rows.length === 0 && (
            <p className="px-2 py-3 text-[11px] text-amber-400/90" data-extraction-state="empty">
              The extraction has no rows.
            </p>
          )}
          {runsView && plan && (
            <div className="max-h-[70vh] overflow-auto">
              <ReviewRunsList
                plan={plan}
                selectedUnit={selUnit}
                looked={cov.looked}
                edited={editedUnits}
                open={cov.open}
                onToggle={cov.toggleRun}
                onSelect={selectUnit}
              />
            </div>
          )}
          {!runsView && (
          <div className="max-h-[70vh] overflow-auto rounded border border-white/5" hidden={rows.length === 0}>
            <table className="w-full text-[11px] font-mono" data-review-rows>
              <thead className="text-[9px] uppercase tracking-widest text-slate-500 text-left">
                <tr>
                  <th className="px-2 py-1 font-normal">mpn</th>
                  <th className="px-2 py-1 font-normal">change</th>
                  <th className="px-2 py-1 font-normal">value</th>
                  <th className="px-2 py-1 font-normal">via</th>
                  <th className="px-2 py-1 font-normal" />
                  {editsActive && <th className="px-2 py-1 font-normal" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <Fragment key={r.key}>
                  <tr
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    onClick={() => select(i)}
                    aria-selected={i === sel}
                    data-review-row={r.key}
                    data-selected={i === sel ? "" : undefined}
                    className={`cursor-pointer align-top ${i === sel ? "bg-pink-500/10 text-slate-100" : "text-slate-300 hover:bg-white/5"}`}
                  >
                    <td className="px-2 py-1 whitespace-nowrap" data-cell="mpn">
                      {editsActive && draft.deleted[r.mpn] ? (
                        <span className="line-through text-slate-500" data-deleted>{r.mpn}</span>
                      ) : editsActive && Object.hasOwn(draft.corrected, r.mpn) ? (
                        <>
                          <span className="line-through text-slate-500">{r.mpn}</span>
                          <span className="text-cyan-300" data-corrected-to> {draft.corrected[r.mpn] || "…"}</span>
                        </>
                      ) : (
                        r.mpn
                      )}
                    </td>
                    <td className="px-2 py-1 text-slate-400" data-cell="field">{r.field ?? "—"}</td>
                    <td className="px-2 py-1 break-all" data-cell="value">
                      {r.extracted_value ?? "—"}
                      {r.needs_review && (
                        <span className="block text-[9px] text-amber-400/80" data-needs-review>
                          extractor unsure{r.review_reason ? `: ${r.review_reason}` : ""}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 text-slate-500" data-cell="via">
                      {isDocLevel(r) ? (
                        <span className="text-violet-300/70" data-evidence-note="doc_level">doc_level</span>
                      ) : (
                        (r.obtained_via ?? "—")
                      )}
                      {r.evidence.state === "ok" && r.evidence.ref.bbox !== null && evidenceQuality(r.obtained_via) === "region" && (
                        <span className="block text-[9px] text-amber-400/70" data-evidence-note="region">
                          table box, not the cell
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-1 whitespace-nowrap text-right">
                      {r.evidence.state === "ok" ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            select(i);
                          }}
                          className="px-1.5 py-0.5 rounded border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500/10 text-[9px] uppercase tracking-widest cursor-pointer"
                          data-show-row={r.key}
                          data-show-no-box={r.evidence.ref.bbox === null ? "" : undefined}
                        >
                          show p{r.evidence.ref.page}
                          {r.evidence.ref.bbox === null ? " · no box" : ""}
                        </button>
                      ) : (
                        <span
                          className="text-[9px] uppercase tracking-widest text-amber-400/80"
                          data-evidence-state={r.evidence.state}
                          title={r.evidence.state === "malformed" ? MALFORMED_REASON_LABELS[r.evidence.reason] : undefined}
                          data-malformed-reason={r.evidence.state === "malformed" ? r.evidence.reason : undefined}
                        >
                          {r.evidence.state === "absent" ? "no evidence" : "unreadable"}
                        </span>
                      )}
                    </td>
                    {editsActive && (
                      <td className="px-2 py-1 whitespace-nowrap text-right">
                        {firstOfMpn.has(i) &&
                          (draft.deleted[r.mpn] || Object.hasOwn(draft.corrected, r.mpn) ? (
                            <button
                              type="button"
                              disabled={locked}
                              onClick={(e) => {
                                e.stopPropagation();
                                undoRow(r.mpn);
                              }}
                              className={EDIT_BTN}
                              data-row-undo={r.mpn}
                            >
                              undo
                            </button>
                          ) : (
                            <span className="inline-flex gap-1">
                              <button
                                type="button"
                                disabled={locked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startFix(r.mpn, r.evidence.state === "ok" ? `p.${r.evidence.ref.page}` : "");
                                }}
                                className={EDIT_BTN}
                                data-row-fix={r.mpn}
                              >
                                fix
                              </button>
                              <button
                                type="button"
                                disabled={locked}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDraft((d) => ({ ...d, deleted: { ...d.deleted, [r.mpn]: { reason: "" } } }));
                                }}
                                className={EDIT_BTN}
                                data-row-delete={r.mpn}
                              >
                                delete
                              </button>
                            </span>
                          ))}
                      </td>
                    )}
                  </tr>
                  {editsActive && firstOfMpn.has(i) && Object.hasOwn(draft.corrected, r.mpn) && !draft.deleted[r.mpn] && (
                    <tr data-fix-row={r.mpn}>
                      <td colSpan={6} className="px-2 pb-1.5">
                        <div className="flex flex-wrap gap-1.5">
                          <input
                            value={draft.corrected[r.mpn]}
                            disabled={locked}
                            onChange={(e) => setDraft((d) => ({ ...d, corrected: { ...d.corrected, [r.mpn]: e.target.value } }))}
                            placeholder="corrected mpn"
                            aria-label={`Corrected mpn for ${r.mpn}`}
                            data-fix-mpn={r.mpn}
                            className={EDIT_INPUT}
                          />
                          <input
                            value={draft.correctedEvidence[r.mpn] ?? ""}
                            disabled={locked}
                            onChange={(e) => setDraft((d) => ({ ...d, correctedEvidence: { ...d.correctedEvidence, [r.mpn]: e.target.value } }))}
                            placeholder="evidence"
                            aria-label={`Evidence for the correction of ${r.mpn}`}
                            data-fix-evidence={r.mpn}
                            className={EDIT_INPUT}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                  {editsActive && firstOfMpn.has(i) && draft.deleted[r.mpn] && (
                    <tr data-delete-row={r.mpn}>
                      <td colSpan={6} className="px-2 pb-1.5">
                        <input
                          value={draft.deleted[r.mpn].reason}
                          disabled={locked}
                          onChange={(e) => setDraft((d) => ({ ...d, deleted: { ...d.deleted, [r.mpn]: { reason: e.target.value } } }))}
                          placeholder="reason for deleting"
                          aria-label={`Reason for deleting ${r.mpn}`}
                          data-delete-reason={r.mpn}
                          className={EDIT_INPUT}
                        />
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          )}
          <p className="mt-1.5 text-[9px] font-mono uppercase tracking-widest text-slate-600">
            {runsOn && plan
              ? runsView
                ? "j/k ↑/↓ parts · shift jumps to checks · Home/End/s in group · click the page · [ ] pages · p promote · r reject"
                : "j/k ↑/↓ rows · [ ] pages · p promote · r reject"
              : "j/k rows · [ ] pages · p promote · r reject"}
          </p>
          {editsActive && <RowAddForm disabled={locked} draft={draft} setDraft={setDraft} />}
          {editsActive && locked && (
            <p className="mt-1 text-[11px] text-amber-400/90" role="status" data-row-edits-locked>
              The promotion and these edits are recorded; the extraction_defect was not filed. Promote again — the same edits are sent.
            </p>
          )}
          {editsActive && problems.length > 0 && (
            <ul className="mt-1 text-[11px] text-amber-400/90" data-row-edits-incomplete>
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
        </div>

        {/* RIGHT — the source, at the selected row's evidence. */}
        <PdfEvidencePane
          ingestId={ingestId}
          target={target}
          quality={targetQuality}
          sharedBy={targetShared}
          onPhase={setSourcePhase}
          jumpKey={jumpKey}
          ref={paneRef}
          callout={
            runsOn && plan && selected && selUnit >= 0 ? (
              <ReviewCallout
                unit={plan.units[selUnit]}
                row={selected}
                looked={cov.looked.has(plan.units[selUnit].id)}
                edited={editedUnits.has(selUnit)}
                sampled={plan.sampled.has(selUnit)}
                canPrevCheck={nextCheck(plan, selUnit, -1, cov.looked) !== null}
                canNextCheck={nextCheck(plan, selUnit, 1, cov.looked) !== null}
                onPrev={() => stepUnit(-1)}
                onNext={() => stepUnit(1)}
                onPrevCheck={() => stepCheck(-1)}
                onNextCheck={() => stepCheck(1)}
                place={placeOf(plan).get(selUnit)}
                onGroupStart={() => jumpGroup("start")}
                onGroupEnd={() => jumpGroup("end")}
                onGroupRandom={randomGroup}
                onFix={
                  editsActive && !locked && !draft.deleted[plan.units[selUnit].mpn] && !Object.hasOwn(draft.corrected, plan.units[selUnit].mpn)
                    ? () => {
                        const u = plan.units[selUnit];
                        const r = rows[u.primary];
                        cov.setView("rows");
                        startFix(u.mpn, r.evidence.state === "ok" ? `p.${r.evidence.ref.page}` : "");
                      }
                    : undefined
                }
              />
            ) : undefined
          }
          onPagePoint={runsOn && plan ? onPagePoint : undefined}
        />
      </div>

      {/* BOTTOM — the decision. */}
      <div className="mt-4">
        {blocked ? (
          <TaskActBlocked task={task} a={a} />
        ) : (
          <div className="flex flex-col gap-2" data-review-actions>
            <TaskActNotices a={a} />
            {armed && canPromote && (
              <p className="text-[11px] font-mono text-neon-green" role="status" data-promote-armed>
                Press p again, or Enter, to promote. Esc cancels.
              </p>
            )}
            {runsOn && plan && (
              <div className="rounded border border-white/5 px-2 py-1 text-[10px] font-mono text-slate-500" data-record-preview>
                <p data-record-sent>
                  sent today: {promoteVerb ?? "the verb"}, the note, {rowCount} row edits, {headerCount} header edits
                </p>
                <p data-record-proposed title={COVERAGE_PACKET}>
                  not recorded yet (proposed): looked at {planLooked} of {plan.units.length} parts,{" "}
                  {plan.units.length - planLooked - checksLeft} covered by runs,{" "}
                  {plan.sharedFacts.filter((f) => cov.confirmed.has(f.key)).length} shared facts confirmed once
                </p>
              </div>
            )}
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="note (optional; sent with the decision)"
              aria-label="Note for decision"
              data-review-note
              className="w-full px-2 py-1.5 rounded bg-black/30 border border-white/10 text-[11px] font-mono text-slate-200 placeholder:text-slate-600"
            />
            <div className="flex flex-wrap gap-2">
              {promoteVerb && (
                <button
                  type="button"
                  onClick={promote}
                  disabled={!canPromote}
                  data-verb={promoteVerb}
                  data-promote-hold={promoteHold ?? undefined}
                  data-row-edit-count={editCount > 0 ? editCount : undefined}
                  title={
                    promoteHold === "sent-back"
                      ? sentBackText(hold!)
                      : promoteHold === "unchecked"
                        ? (uncheckedText ?? undefined)
                        : promoteHold
                          ? HOLD_TEXT[promoteHold]
                          : undefined
                  }
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-green/10 border-neon-green/50 text-neon-green hover:bg-neon-green/20"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />{" "}
                  {editCount > 0 ? `Promote with ${editCount} edit${editCount === 1 ? "" : "s"}` : verbLabel(promoteVerb)}
                </button>
              )}
              {rejectVerb && (
                <button
                  type="button"
                  onClick={() => {
                    setArmed(false);
                    setRejectOpen((o) => !o);
                  }}
                  disabled={!canAct}
                  aria-expanded={rejectOpen}
                  data-verb={rejectVerb}
                  className="flex-1 min-w-[7rem] flex items-center justify-center gap-1.5 px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                >
                  <XCircle className="w-3.5 h-3.5" /> {verbLabel(rejectVerb)}…
                </button>
              )}
              {otherVerbs.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => void act(v, note)}
                  disabled={!canAct || (needsReason(v) && !note.trim())}
                  data-verb={v}
                  title={needsReason(v) && !note.trim() ? `${verbLabel(v)} requires a reason: write it in the note` : undefined}
                  className="flex-1 min-w-[7rem] px-3 py-2 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-white/5 border-white/20 text-slate-300 hover:bg-white/10"
                >
                  {verbLabel(v)}
                </button>
              ))}
            </div>
            {promoteVerb &&
              (promoteHold === "no-rows" || promoteHold === "no-source" || promoteHold === "sent-back" || promoteHold === "dropper" || promoteHold === "unchecked") && (
              <p className="text-[11px] text-amber-400/90" data-promote-held={promoteHold}>
                {promoteHold === "sent-back" ? sentBackText(hold!) : promoteHold === "unchecked" ? uncheckedText : HOLD_TEXT[promoteHold]}
              </p>
            )}
            {rejectOpen && rejectVerb && editCount > 0 && (
              <p className="text-[11px] text-amber-400/90" data-reject-drops-edits>
                A reject sends no row edits; the drafted edits are not sent.
              </p>
            )}
            {rejectOpen && rejectVerb && (
              <fieldset className="rounded border border-pink-500/20 bg-pink-500/5 px-3 py-2" data-reject-codes>
                <legend className="px-1 text-[10px] font-mono uppercase tracking-widest text-pink-300/80">
                  reject: why
                </legend>
                <div className="flex flex-col gap-1">
                  {review.rejectCodes.map((c, i) => (
                    <label key={c.code} className="flex items-baseline gap-2 text-[11px] cursor-pointer" data-reject-code={c.code}>
                      <input
                        type="radio"
                        name={`reject-code-${task.task_id}`}
                        checked={code === c.code}
                        onChange={() => setCode(c.code)}
                      />
                      <span className="font-mono text-slate-500">{i + 1}</span>
                      <span className="font-mono text-slate-200">{c.code}</span>
                      <span className="text-slate-500">{c.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={reject}
                  disabled={!canAct || !code}
                  data-reject-confirm
                  className="mt-2 px-3 py-1.5 rounded border text-[11px] font-mono uppercase tracking-widest disabled:opacity-40 cursor-pointer bg-neon-pink/10 border-neon-pink/50 text-neon-pink hover:bg-neon-pink/20"
                >
                  {verbLabel(rejectVerb)}
                  {code ? `: ${code}` : ""}
                </button>
              </fieldset>
            )}
          </div>
        )}
        {/* Export: only once the task is no longer pending (the control itself gates on stage === "promoted"). */}
        {(a.done !== null || (task.task_state != null && task.task_state !== "pending")) && (
          <ReviewExportControl ingestId={ingestId} />
        )}
      </div>
    </div>
  );
}
