import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";
import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";

/** Lexical rich text → HTML (RSS items, emails). Never throws. */
export function lexicalToHtml(body: unknown): string {
  try {
    return convertLexicalToHTML({ data: body as SerializedEditorState });
  } catch {
    return "";
  }
}
