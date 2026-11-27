import type { CollectionInfo, ExtraTool } from "@acme/mcp";
import type { ModMcpContext, ModMcpExtension } from "@acme/mod-kit/server";

/**
 * Turn installed modules' MCP contributions into the extra tools/collections
 * @acme/mcp registers for ONE request. Pure (enablement and the context are
 * injected) so it unit-tests without Next or Payload.
 *
 * - Only enabled modules contribute.
 * - Tool names must start with `<slug>_` (dashes → `_`); others are dropped
 *   with a warning, so a module can't shadow a core tool or another module's.
 */
export async function moduleMcpExtras(
  modules: Record<string, ModMcpExtension>,
  isEnabled: (slug: string) => Promise<boolean>,
  ctx: ModMcpContext,
): Promise<{
  extraTools: ExtraTool[];
  extraCollections: CollectionInfo[];
  extraInstructions: string[];
}> {
  const extraTools: ExtraTool[] = [];
  const extraCollections: CollectionInfo[] = [];
  const extraInstructions: string[] = [];
  for (const [slug, ext] of Object.entries(modules)) {
    if (!(await isEnabled(slug))) continue;
    const prefix = `${slug.replace(/-/g, "_")}_`;
    for (const tool of ext.tools ?? []) {
      if (!tool.name.startsWith(prefix)) {
        console.warn(
          `[mcp] module "${slug}": tool "${tool.name}" must start with "${prefix}" — skipped`,
        );
        continue;
      }
      extraTools.push({
        name: tool.name,
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
        readOnly: tool.readOnly,
        run: (args) => tool.run(args, ctx),
      });
    }
    extraCollections.push(...(ext.collections ?? []));
    if (ext.instructions) extraInstructions.push(ext.instructions);
  }
  return { extraTools, extraCollections, extraInstructions };
}
