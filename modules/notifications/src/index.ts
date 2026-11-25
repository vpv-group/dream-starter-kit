/**
 * Client-safe barrel — react-query hooks shared by web + native, plus the
 * producer contract types/helpers. Any module (or the dashboard) may import
 * these to render a badge.
 */
export {
  useMarkNotificationRead,
  useNotifications,
  useUnreadCount,
} from "./hooks/use-notifications";
export type {
  EmailPayload,
  NotificationAudience,
  NotificationCategory,
  NotificationChannel,
  NotificationEntity,
  NotificationPayload,
  PushPayload,
} from "./contract";
export {
  CATEGORY_KEY_RE,
  defineNotificationCategories,
  isSafeNotificationUrl,
  NOTIFICATION_CHANNELS,
  notificationHref,
} from "./contract";
