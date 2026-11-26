import type { CollectionAfterChangeHook } from "payload";

import type { Report } from "@acme/cms";

/**
 * Keep the target's denormalized `reportCount` in step when a report is filed,
 * so moderators can sort by most-reported (and auto-hide past a threshold).
 *
 * It RECOUNTS the target's reports instead of reading the old value and
 * adding one: read-modify-write loses increments when two reports land at
 * once, while a recount is right again as soon as the next report (or any
 * save) runs. Best-effort: a failed counter update never fails the report.
 */
export const incrementReportCount: CollectionAfterChangeHook<Report> = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== "create") return doc;
  const target = doc.target;
  const targetId =
    typeof target.value === "object" ? target.value.id : target.value;
  // The generated Report type constrains this to community-posts | comments.
  const relationTo = target.relationTo;

  try {
    const { totalDocs } = await req.payload.count({
      collection: "reports",
      where: {
        and: [
          { "target.relationTo": { equals: relationTo } },
          { "target.value": { equals: targetId } },
        ],
      },
      overrideAccess: true,
      req,
    });
    await req.payload.update({
      collection: relationTo,
      id: targetId,
      data: { reportCount: totalDocs },
      depth: 0,
      overrideAccess: true,
      // Counter maintenance — marker for any future hooks to skip.
      context: { skipReportCount: true },
      req,
    });
  } catch (err) {
    req.payload.logger.warn(
      { err },
      "reports: failed to update target reportCount",
    );
  }
  return doc;
};
