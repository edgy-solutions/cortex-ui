import { INGEST_KIND_EXTENSIONS } from "@/lib/ingestKindInfer";

/** The composer's file picker accept list: every extension `ingestKindInfer`'s table decides on
 *  (pdf, xml, and the cad set), plus the two MIME types a PDF/XML chooser filters by. */
export const INGEST_ACCEPT = ["application/pdf", "application/xml", "text/xml", ...INGEST_KIND_EXTENSIONS].join(",");
