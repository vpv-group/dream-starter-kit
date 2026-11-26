import "server-only";

import type { z } from "zod/v4";
import { embed, generateText, Output } from "ai";

import {
  AI_MAX_OUTPUT_TOKENS,
  DEFAULT_AI_MODEL,
  DEFAULT_EMBEDDING_MODEL,
  isAiGatewayConfigured,
  ROUTING_AI_MODEL,
} from "@acme/config";

/**
 * The AI calls Autopilot makes, behind a small interface so the triage logic
 * unit-tests with fakes. Models come from @acme/config (golden rule #5),
 * output is token-capped (golden rule #6); callers are cron jobs, staff
 * routes, or signed-in non-anonymous members (semantic search).
 */
export interface FeedbackAi {
  embed(text: string): Promise<number[]>;
  /** Small structured answers (classification, extraction) on the fast model. */
  object<S extends z.ZodType>(prompt: string, schema: S): Promise<z.infer<S>>;
  /** Prose (summaries, replies, drafts) on the default model. */
  text(prompt: string, maxOutputTokens?: number): Promise<string>;
}

export function aiConfigured(): boolean {
  return isAiGatewayConfigured();
}

export const gatewayAi: FeedbackAi = {
  async embed(text) {
    const { embedding } = await embed({
      model: DEFAULT_EMBEDDING_MODEL,
      value: text.slice(0, 8000),
    });
    return embedding;
  },
  async object(prompt, schema) {
    const { output } = await generateText({
      model: ROUTING_AI_MODEL,
      prompt,
      temperature: 0,
      maxOutputTokens: 600,
      output: Output.object({ schema }),
    });
    return output as z.infer<typeof schema>;
  },
  async text(prompt, maxOutputTokens = AI_MAX_OUTPUT_TOKENS) {
    const { text } = await generateText({
      model: DEFAULT_AI_MODEL,
      prompt,
      maxOutputTokens: Math.min(maxOutputTokens, AI_MAX_OUTPUT_TOKENS),
    });
    return text.trim();
  },
};

export { toVector } from "./vector";
