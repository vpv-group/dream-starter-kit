/**
 * @acme/app — shared, cross-platform feature logic (validators, auth actions,
 * data hooks). UI stays per-platform in apps/*; the logic lives here so web and
 * native share one implementation.
 */

export * from "./validators/auth";
export * from "./validators/tag";
export * from "./validators/workspace";
export * from "./auth";
export * from "./captcha";
export { CaptchaContext, useCaptcha } from "./captcha-context";
export type { CaptchaContextValue } from "./captcha-context";
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
export {
  useProfile,
  useUpdateProfile,
  syncProfileToCms,
} from "./hooks/use-profile";
export {
  useChangeEmail,
  useResendEmailChange,
  useChangePassword,
  useSendReauthenticationCode,
} from "./hooks/use-account";
export type { ChangePasswordResult } from "./hooks/use-account";
export { useDeleteAccount, SoleOwnerError } from "./hooks/use-delete-account";
export { useUserTags } from "./hooks/use-tags";
export type { UserTag } from "./hooks/use-tags";
export { useNavMenu } from "./hooks/use-nav-menu";
export type { NavMenuEntry } from "./hooks/use-nav-menu";
export { useNativeNav, defaultNativeNavConfig } from "./hooks/use-native-nav";
export type {
  NativeNavDefault,
  NativeNavState,
  UseNativeNavOptions,
} from "./hooks/use-native-nav";
export * from "./nav/native-nav";
export * from "./nav/native-icons";
export * from "./nav/native-nav-store";
export * from "./nav/core-nav";
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
