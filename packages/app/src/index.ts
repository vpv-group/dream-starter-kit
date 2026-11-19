/**
 * @acme/app — shared, cross-platform feature logic (validators, auth actions,
 * data hooks). UI stays per-platform in apps/*; the logic lives here so web and
 * native share one implementation.
 */

export * from "./validators/auth";
export * from "./validators/tag";
export * from "./validators/workspace";
export * from "./auth";
export * from "./auth-settings";
export * from "./workspaces";
export * from "./post-auth";
export { useAuthConfig } from "./hooks/use-auth-config";
export * from "./hooks/use-content";
export {
  useFavorites,
  useToggleFavorite,
  favoriteKey,
  type ToggleFavoriteInput,
} from "./hooks/use-favorites";
export { useProfile, useUpdateProfile } from "./hooks/use-profile";
export { useDeleteAccount, SoleOwnerError } from "./hooks/use-delete-account";
export { useUserTags } from "./hooks/use-tags";
export type { UserTag } from "./hooks/use-tags";
export { useNavMenu } from "./hooks/use-nav-menu";
export type { NavMenuEntry } from "./hooks/use-nav-menu";
export {
  useMyWorkspaces,
  useSlugAvailability,
  useCreateWorkspace,
  useSaveOnboardingProgress,
  useSetActiveOrg,
  useSetSignupIntent,
  toMyWorkspace,
  workspacesKey,
  useMyPendingInvitations,
  useAcceptPendingInvitation,
  useAcceptInvitation,
  useWorkspaceMembers,
  useWorkspaceInvitations,
  useRevokeInvitation,
  useUpdateMemberRole,
  useRemoveMember,
  useSetJoinLink,
  useSendInvitations,
  useResendInvitation,
  useResetJoinLink,
} from "./hooks/use-workspaces";
export type {
  MyWorkspace,
  SlugStatus,
  PendingInvitation,
  WorkspaceMember,
  WorkspaceInvitation,
  InviteResultRow,
} from "./hooks/use-workspaces";
