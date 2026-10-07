import { fallbackSubjectLabel, looksLikeIri } from "@/lib/confidence";
import { FileText } from "lucide-react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FederatedImage } from "@/components/mesh/FederatedImage";
import { knowledgeDocumentView } from "./knowledgeDocumentView";

/**
 * MarkdownRenderer — KNOWLEDGE_DOCUMENT archetype render.
 *
 * ADR-0055 step 2: extracted verbatim out of `SemanticInterpreter.tsx`'s
 * `case "KNOWLEDGE_DOCUMENT":` (the routing) and its module-scope `MarkdownRenderer` component
 * (the single-document body), with zero visual change — see `parity.test.tsx`.
 *
 * TWO COMPONENTS, ONE EXPORT. The outer `MarkdownRenderer` is what `contract.ts`'s
 * `component: "MarkdownRenderer"` names and what the registry dispatches to; it is the
 * ROUTING — deciding, via `knowledgeDocumentView`, whether the payload is an engine-docs
 * answer (one or more pages), an engine-docs abstain, or a plain markdown string, and drawing
 * the wrapper markup (`data-doc-pages`, `data-doc-page-count-mismatch`,
 * `data-doc-abstained`) that used to live inline in the interpreter's `case` block. The inner
 * `MarkdownDocumentBody` (renamed from the old module-scope `MarkdownRenderer` — the two
 * cannot share a name in one file) draws ONE document's markdown, and is called once per
 * page when several tied.
 *
 * Rebuilt 2026-06-26 (user feedback iterations):
 *   1. Tried Tailwind `prose`, `prose-invert`, and various dark-mode
 *      modifiers. Those did NOTHING because `@tailwindcss/typography`
 *      isn't installed in this project (Tailwind v4 setup, no
 *      plugin) — every `prose` class was a no-op. Markdown rendered
 *      as plain unstyled HTML; "everything in bright white, all the
 *      same, hard to read."
 *   2. Hand-styled component overrides via `react-markdown`'s
 *      `components` prop instead — explicit Tailwind classes per
 *      element, matching the rest of the UI's "Dark Glass & Neon"
 *      language (cyan-500 accents, slate-200 body text, glass-panel
 *      container) rather than depending on a plugin that was never
 *      installed.
 *
 * Headings step down in both size AND color saturation (white → cyan-100 → cyan-200) so a
 * deeply-nested document still reads as a hierarchy. Body text is slate-200, not slate-300 or
 * slate-400 as used elsewhere for secondary text — markdown content IS the primary content of
 * this card, unlike a caption or a footer note, so it gets the brighter of the two "readable"
 * lines — slate-200 keeps long-form content scannable.
 */
const MarkdownDocumentBody = ({
  content,
  subject,
  audience,
  citedSeals,
}: {
  content: string;
  subject?: string;
  /** engine-docs `audience_hint`: DISPLAY ROUTING, NOT AUTHZ. Shown, never used to hide. */
  audience?: string;
  /** engine-docs `cited_seals`, in the page's own order. */
  citedSeals?: string[];
}) => {
  const wordCount = content
    ? content.split(/\s+/).filter((w) => w.length > 0).length
    : 0;

  return (
    <div className="glass-panel p-6 my-4 border-cyan-500/20 relative overflow-hidden">
      {/* Header — matches ChartWidget / topology / table */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
          <h3 className="text-xl font-bold text-white tracking-tight leading-none">
            {/* AN IRI IS NOT A TITLE. This card is the fallback every unregistered archetype
                lands on, and what arrives as its subject is whatever the producer had — for a
                slot elicitation that is the VERB, `mesh:finFundingStatus`, printed raw as the
                heading. Rendering the local name is a projection of the value the producer
                sent, not a name invented for it; a subject someone actually wrote is left
                exactly as written. */}
            {looksLikeIri(subject) ? fallbackSubjectLabel(subject) : subject || "Knowledge Document"}
          </h3>
        </div>
        <p className="text-[10px] text-cyan-400/70 uppercase tracking-[0.2em] font-mono font-bold flex items-center gap-2">
          <FileText className="w-3 h-3" />
          Knowledge Document · {wordCount} {wordCount === 1 ? "word" : "words"}
          {audience && <span data-doc-audience>· for {audience}</span>}
        </p>
      </div>

      {/* Markdown body — each HTML element mapped to a styled component */}
      <div className="text-sm leading-relaxed">
        <Markdown
          remarkPlugins={[remarkGfm]}
          components={{
            h1: ({ children }) => (
              <h1 className="text-2xl font-bold text-white tracking-tight border-b border-cyan-500/20 pb-2 mb-4 mt-6 first:mt-0">
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 className="text-xl font-bold text-white tracking-tight border-b border-cyan-500/10 pb-1.5 mb-3 mt-6 first:mt-0">
                {children}
              </h2>
            ),
            h3: ({ children }) => (
              <h3 className="text-lg font-semibold text-cyan-100 tracking-tight mb-2 mt-5 first:mt-0">
                {children}
              </h3>
            ),
            h4: ({ children }) => (
              <h4 className="text-base font-semibold text-cyan-200 mb-2 mt-4 first:mt-0">
                {children}
              </h4>
            ),
            p: ({ children }) => (
              <p className="text-slate-200 leading-relaxed my-3">{children}</p>
            ),
            strong: ({ children }) => (
              <strong className="text-white font-semibold">{children}</strong>
            ),
            em: ({ children }) => (
              <em className="text-cyan-200 italic">{children}</em>
            ),
            a: ({ href, children }) => (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 font-medium underline decoration-cyan-500/30 hover:decoration-cyan-400/60 transition-colors"
              >
                {children}
              </a>
            ),
            // react-markdown emits <code> for inline. Block code is
            // wrapped in <pre><code>. We style inline here; the <pre>
            // wrapper handles block presentation, and we reset the
            // inline styling when nested inside it.
            code: ({ className, children, ...rest }) => {
              const isBlock = (className || "").includes("language-");
              if (isBlock) {
                // Inside <pre>; let pre's styling drive the block.
                return (
                  <code
                    className="block font-mono text-[13px] text-cyan-200 leading-relaxed"
                    {...rest}
                  >
                    {children}
                  </code>
                );
              }
              return (
                <code className="font-mono text-[0.85em] text-cyan-300 bg-cyan-500/10 px-1.5 py-0.5 rounded">
                  {children}
                </code>
              );
            },
            pre: ({ children }) => (
              <pre className="bg-slate-950/60 border border-cyan-500/10 rounded-lg p-4 my-4 overflow-x-auto">
                {children}
              </pre>
            ),
            blockquote: ({ children }) => (
              <blockquote className="border-l-2 border-cyan-500/40 pl-4 my-4 text-slate-300 italic">
                {children}
              </blockquote>
            ),
            ul: ({ children }) => (
              <ul className="list-disc pl-6 my-3 text-slate-200 marker:text-cyan-500/60 space-y-1">
                {children}
              </ul>
            ),
            ol: ({ children }) => (
              <ol className="list-decimal pl-6 my-3 text-slate-200 marker:text-cyan-500/60 space-y-1">
                {children}
              </ol>
            ),
            li: ({ children }) => <li className="leading-relaxed">{children}</li>,
            hr: () => <hr className="border-cyan-500/20 my-6" />,
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="w-full text-left text-sm border-collapse">
                  {children}
                </table>
              </div>
            ),
            thead: ({ children }) => (
              <thead className="border-b border-cyan-500/20">{children}</thead>
            ),
            tbody: ({ children }) => (
              <tbody className="divide-y divide-white/5">{children}</tbody>
            ),
            tr: ({ children }) => (
              <tr className="hover:bg-cyan-500/[0.04] transition-colors">
                {children}
              </tr>
            ),
            th: ({ children }) => (
              <th className="px-3 py-2 font-mono text-[10px] uppercase tracking-widest font-semibold text-cyan-400/80">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-3 py-2.5 text-slate-200 align-top">{children}</td>
            ),
            img: ({ src, alt }) => (
              <div className="my-6 rounded-xl overflow-hidden border border-cyan-500/15 bg-black/50 p-2">
                <FederatedImage
                  src={src || ""}
                  alt={alt}
                  className="w-full max-h-[500px] object-contain rounded-lg opacity-90 hover:opacity-100 transition-opacity"
                />
                {alt && (
                  <p className="text-center mt-2 font-mono text-[10px] text-slate-500 uppercase tracking-widest">
                    {alt}
                  </p>
                )}
              </div>
            ),
          }}
        >
          {content}
        </Markdown>
      </div>

      {/* Footer — matches chart pattern */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4 text-[10px] font-mono text-slate-500 uppercase tracking-tighter">
        <div className="flex items-center gap-1">
          <span className="text-cyan-500/50">Words:</span>
          <span>{wordCount}</span>
        </div>
      </div>
      {citedSeals && citedSeals.length > 0 && (
        <ol data-doc-cited-seals className="mt-3 space-y-0.5 text-[10px] font-mono text-slate-500">
          {citedSeals.map((seal) => (
            <li key={seal}>
              <span className="text-cyan-500/50">Seal:</span> {seal}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

/**
 * The routing, moved verbatim out of `SemanticInterpreter.tsx`'s `case "KNOWLEDGE_DOCUMENT":`.
 * Three shapes, decided in `knowledgeDocumentView.ts`: engine-docs pages, an engine-docs
 * abstain, or the plain markdown string. Structure wins over a placeholder string.
 *
 * Props are exactly `row.payload_key` (`markdown_content`) plus
 * `KNOWLEDGE_DOCUMENT_ENVELOPE_FIELDS` — the fields the interpreter's dispatch hands this
 * package (see `index.ts`), unchanged from what `knowledgeDocumentView` read off `comp` before
 * this move.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const MarkdownRenderer = (props: any) => {
  const view = knowledgeDocumentView(props);
  if (view.kind === "pages") {
    const short = view.declaredCount !== undefined && view.declaredCount !== view.pages.length;
    return (
      <div data-doc-pages={view.pages.length}>
        {short && (
          <p data-doc-page-count-mismatch className="text-[10px] font-mono text-amber-400/80 uppercase tracking-widest">
            {view.pages.length} of {view.declaredCount} pages arrived
          </p>
        )}
        {view.pages.map((p, i) => (
          <MarkdownDocumentBody
            key={`${p.title ?? "page"}-${i}`}
            content={p.body}
            subject={p.title ?? view.subject}
            audience={p.audience}
            citedSeals={p.citedSeals}
          />
        ))}
      </div>
    );
  }
  if (view.kind === "abstain") {
    return (
      <div data-doc-abstained>
        <MarkdownDocumentBody content={view.body} subject={view.subject} />
      </div>
    );
  }
  return <MarkdownDocumentBody content={view.content} subject={view.subject} />;
};
