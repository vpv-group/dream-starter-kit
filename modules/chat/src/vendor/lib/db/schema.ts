// KIT ADAPTATION (see VENDOR.md): upstream defined these via Drizzle pgTable;
// here they are plain types backed by the module's Supabase tables
// (mod_chat_threads / mod_chat_messages / mod_chat_documents /
// mod_chat_suggestions / mod_chat_votes). Field names stay camelCase so the
// vendored components match upstream — queries.ts maps snake_case rows.

export type Chat = {
  id: string;
  createdAt: Date;
  title: string;
  userId: string;
  visibility: "public" | "private";
};

export type DBMessage = {
  id: string;
  chatId: string;
  role: string;
  parts: unknown;
  attachments: unknown;
  createdAt: Date;
};

export type Vote = {
  chatId: string;
  messageId: string;
  isUpvoted: boolean;
};

export type Document = {
  id: string;
  createdAt: Date;
  title: string;
  content: string | null;
  kind: "text" | "code" | "image" | "sheet";
  userId: string;
};

export type Suggestion = {
  id: string;
  documentId: string;
  documentCreatedAt: Date;
  originalText: string;
  suggestedText: string;
  description: string | null;
  isResolved: boolean;
  userId: string;
  createdAt: Date;
};
