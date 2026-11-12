/**
 * Layout harness for e2e/groupedReviewTableLayout.spec.ts: the OV-19-05 disposition card (17 parts, each
 * needing a disposition) mounted inside a wrapper whose width in px comes from `?w=`, standing in for a
 * canvas card. Not shipped: only vite dev serves it.
 */
import { createRoot } from "react-dom/client";
import "../../src/index.css";
import { GroupedReviewTable } from "../../src/components/GroupedReview/GroupedReviewTable";
import type { ReviewBatch } from "../../src/components/GroupedReview/types";

const MPNS = [
  "DX0783-ULG2B00-A4", "DX0783-ULG2B01-A4", "DX0793-ELG2B00-A4", "DX7753-ULG2B00-A4", "DX8213-CHG-A3", "DX8243-CHG-A3",
  "DX8313-CBG-A3", "DX8313-NBG-A3", "DX8342-NBG-A3", "DX8353-CBG-A3", "DX8773-ELG2A00-A4", "DX8773-ELG2A01-A4",
  "DX9353-CBG-A3", "DX9773-DLG2A00-A4", "DX9773-DLG2A01-A4", "MX10200-ELG2A01-A4", "MX11300-ELG2A01-A4",
];

const batch = {
  batch_id: "harness-ov-19-05",
  notice_id: "OV-19-05",
  notice_type: "PCN",
  notice_fingerprint: "fp",
  approver: "me",
  items: MPNS.map((mpn) => ({ mpn, proposed_disposition: null, needs_review: false })),
} as unknown as ReviewBatch;

const w = Number(new URLSearchParams(location.search).get("w") ?? "1540");

createRoot(document.getElementById("root")!).render(
  <div id="harness-card" style={{ width: w, margin: 0 }}>
    <GroupedReviewTable batch={batch} />
  </div>,
);
