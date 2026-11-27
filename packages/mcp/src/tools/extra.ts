import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpToolContext } from "../payload-context";
import { jsonResult, runTool } from "./shared";

/**
 * Host-supplied tools (installed modules). Results are plain JSON, errors
 * become `isError` results, exactly like the built-in tools. A name that
 * collides with an already-registered tool is skipped rather than throwing,
 * so one misbehaving module can't take the whole server down.
 */
export function registerExtraTools(
  server: McpServer,
  ctx: McpToolContext,
): void {
  const seen = new Set<string>();
  for (const tool of ctx.extraTools ?? []) {
    if (seen.has(tool.name)) continue;
    seen.add(tool.name);
    try {
      server.registerTool(
        tool.name,
        {
          title: tool.title,
          description: tool.description,
          inputSchema: tool.inputSchema,
          ...(tool.readOnly ? { annotations: { readOnlyHint: true } } : {}),
        },
        (args: Record<string, unknown>) =>
          runTool(async () => {
            const result = await tool.run(args);
            return jsonResult(
              result ?? { ok: true },
              result && typeof result === "object" && !Array.isArray(result)
                ? (result as Record<string, unknown>)
                : undefined,
            );
          }),
      );
    } catch (err) {
      console.error(`[mcp] skipped tool ${tool.name}`, err);
    }
  }
}
