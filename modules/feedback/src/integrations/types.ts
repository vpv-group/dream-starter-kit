import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@acme/api";
import type { ModHostServices } from "@acme/mod-kit/server";

/**
 * The issue-tracker provider contract (GitHub built in; Jira, Linear,
 * Asana… as adapter modules). Providers translate their own states into
 * five shared categories, so status mapping and sync are provider-neutral.
 */

export const STATE_CATEGORIES = [
  "backlog",
  "unstarted",
  "started",
  "completed",
  "canceled",
] as const;
export type StateCategory = (typeof STATE_CATEGORIES)[number];

export interface ExternalIssue {
  provider: string;
  externalId: string;
  /** Human key: "#123", "ENG-42". */
  key: string;
  url: string;
  title: string;
  state: { category: StateCategory; raw: string };
  labels: string[];
  updatedAt: string;
}

export interface ProviderSettings {
  enabled: boolean;
  /** Ordered rows: external category ↔ idea stage, with a direction. */
  statusMapping: StatusMappingRow[];
  newIssueLabels: string[];
  /** Labels that mean "in progress" on an open issue (GitHub). */
  inProgressLabels: string[];
  backlinkComment: boolean;
}

export interface StatusMappingRow {
  external: StateCategory;
  stage: string;
  direction: "both" | "inbound" | "outbound";
}

export interface ProviderContext {
  host: ModHostServices;
  /** Service-role client (sync runs without a user). */
  db: SupabaseClient<Database>;
  settings: ProviderSettings;
  siteUrl: string;
}

export interface ProviderStatus {
  connected: boolean;
  /** e.g. the GitHub repo "owner/name". */
  target?: string;
  reason?: string;
  message?: string;
}

export interface IssueTrackerProvider {
  id: string;
  label: string;
  status(ctx: ProviderContext): Promise<ProviderStatus>;
  search(ctx: ProviderContext, query: string): Promise<ExternalIssue[]>;
  get(ctx: ProviderContext, externalId: string): Promise<ExternalIssue>;
  create(
    ctx: ProviderContext,
    input: { title: string; body: string; labels: string[] },
  ): Promise<ExternalIssue>;
  /** Idempotent: reads the issue and only writes when the state differs. */
  setState(
    ctx: ProviderContext,
    externalId: string,
    category: StateCategory,
  ): Promise<boolean>;
  upsertBacklink(
    ctx: ProviderContext,
    externalId: string,
    body: string,
    commentId?: string | null,
  ): Promise<{ commentId: string }>;
  /** Issues changed since `cursor` (ISO time); returns the next cursor. */
  pollChanged?(
    ctx: ProviderContext,
    cursor: string | null,
    externalIds: string[],
  ): Promise<{ issues: ExternalIssue[]; cursor: string }>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code = "provider_error",
  ) {
    super(message);
  }
}
