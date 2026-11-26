import { z } from "zod/v4";

import { SORTS, VOTE_PRIORITIES } from "../shared/config";

/** Request bodies for /api/mod/feedback/* (shared by web, native and server). */

export const voteInput = z.object({
  postId: z.uuid(),
  voted: z.boolean(),
});
export type VoteInput = z.infer<typeof voteInput>;

export const createPostInput = z.object({
  boardId: z.string().min(1),
  title: z.string().trim().min(3, "Add a short title").max(400),
  details: z.string().trim().max(5000).default(""),
  categoryId: z.string().min(1).nullish(),
  customFields: z.record(z.string(), z.string().max(2000)).default({}),
  attachments: z
    .array(
      z.object({
        id: z.union([z.string(), z.number()]),
        url: z.string().min(1),
        name: z.string().max(200).optional(),
        mime: z.string().max(100).optional(),
      }),
    )
    .max(10)
    .default([]),
});
export type CreatePostInput = z.input<typeof createPostInput>;

export const commentInput = z.object({
  postId: z.uuid(),
  body: z.string().trim().min(1, "Write a comment").max(5000),
  parentId: z.uuid().nullish(),
  internal: z.boolean().default(false),
});
export type CommentInput = z.input<typeof commentInput>;

export const reactionInput = z.object({
  targetType: z.enum(["comment", "status_change"]),
  targetId: z.uuid(),
  liked: z.boolean(),
});

export const subscribeInput = z.object({
  postId: z.uuid(),
  subscribed: z.boolean(),
});

export const statusInput = z.object({
  postId: z.uuid(),
  statusId: z.string().min(1),
  message: z.string().trim().max(5000).nullish(),
  notify: z.boolean().default(true),
});
export type StatusChangeInput = z.input<typeof statusInput>;

export const postUpdateInput = z.object({
  postId: z.uuid(),
  title: z.string().trim().min(3).max(400).optional(),
  details: z.string().trim().max(10000).optional(),
  boardId: z.string().min(1).optional(),
  categoryId: z.string().min(1).nullable().optional(),
  ownerId: z.uuid().nullable().optional(),
  eta: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .nullable()
    .optional(),
  etaPublic: z.boolean().optional(),
  pinned: z.boolean().optional(),
  approvalState: z.enum(["pending", "approved", "rejected"]).optional(),
  tagIds: z.array(z.string().min(1)).max(50).optional(),
  deleted: z.boolean().optional(),
});
export type PostUpdateInput = z.input<typeof postUpdateInput>;

export const mergeInput = z.object({
  sourceId: z.uuid(),
  targetId: z.uuid(),
});

export const voteOnBehalfInput = z.object({
  postId: z.uuid(),
  userId: z.uuid(),
  priority: z.enum(VOTE_PRIORITIES).nullish(),
  remove: z.boolean().default(false),
});

export const commentUpdateInput = z.object({
  commentId: z.uuid(),
  body: z.string().trim().min(1).max(5000).optional(),
  pinned: z.boolean().optional(),
  deleted: z.boolean().optional(),
});

export const listQuery = z.object({
  board: z.string().optional(),
  sort: z.enum(SORTS).default("trending"),
  status: z.array(z.string()).default([]),
  q: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(0).max(1000).default(0),
});

export const ideaCreateInput = z.object({
  title: z.string().trim().min(3).max(400),
  description: z.string().trim().max(20000).default(""),
  stageId: z.string().min(1).nullish(),
  fromPostId: z.uuid().nullish(),
});

export const ideaUpdateInput = z.object({
  ideaId: z.uuid(),
  title: z.string().trim().min(3).max(400).optional(),
  description: z.string().trim().max(20000).optional(),
  ownerId: z.uuid().nullable().optional(),
  eta: z
    .string()
    .regex(/^\d{4}-\d{2}(-\d{2})?$/)
    .nullable()
    .optional(),
  etaPublic: z.boolean().optional(),
  factorValues: z
    .record(z.string(), z.union([z.number(), z.boolean(), z.null()]))
    .optional(),
  syncLocked: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type IdeaUpdateInput = z.input<typeof ideaUpdateInput>;

export const ideaStageInput = z.object({
  ideaId: z.uuid(),
  stageId: z.string().min(1),
  message: z.string().trim().max(5000).nullish(),
  notify: z.boolean().default(true),
});

export const linkPostInput = z.object({
  postId: z.uuid(),
  ideaId: z.uuid().nullable(),
});
