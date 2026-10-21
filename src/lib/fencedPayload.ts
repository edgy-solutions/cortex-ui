/**
 * Decode the engine's fenced flat reply out of a KNOWLEDGE_DOCUMENT's markdown (201).
 *
 * The presentation agent's deterministic document renderer (`_render_document_deterministic`)
 * writes a flat measure reply as optional summary text + ONE fence "```json\n…\n```" at the END.
 * This returns non-null ONLY for exactly that shape: optional prose, then exactly one fenced block
 * whose info string is `json`, last in the document (trailing whitespace allowed), whose body
 * parses to a plain object. Anything else is a document, not a reply, and returns null.
 */
export function decodeFencedPayload(
  markdown: string,
): { prose: string; payload: Record<string, unknown> } | null {
  if (typeof markdown !== "string") return null;
  const text = markdown.replace(/\r\n/g, "\n");
  // Every fence line: ``` or ~~~ opening/closing marker with an optional info string.
  const fenceLine = /^[ \t]{0,3}(`{3,}|~{3,})(.*)$/gm;
  const fences: { index: number; end: number; info: string; marker: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = fenceLine.exec(text)) !== null) {
    fences.push({ index: m.index, end: m.index + m[0].length, info: m[2].trim(), marker: m[1] });
  }
  // Exactly one block = exactly two fence lines (open + close).
  if (fences.length !== 2) return null;
  const [open, close] = fences;
  if (open.info !== "json") return null;
  if (close.info !== "" || close.marker[0] !== open.marker[0] || close.marker.length < open.marker.length) return null;
  // The fence must be last: nothing but whitespace after the closing line.
  if (text.slice(close.end).trim() !== "") return null;
  const body = text.slice(open.end + 1, close.index);
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null;
  return { prose: text.slice(0, open.index).trim(), payload: parsed as Record<string, unknown> };
}
