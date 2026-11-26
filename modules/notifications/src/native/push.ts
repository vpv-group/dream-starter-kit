import { Linking, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";

import type { AppSupabaseClient } from "@acme/api";

import { isSafeNotificationUrl } from "../contract";

// `EXPO_PUBLIC_*` is inlined by Metro at build time — literal reads only.
declare const process: { env: Record<string, string | undefined> };

// Show notifications received while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: () =>
    Promise.resolve({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
});

/**
 * Open a notification's target: app paths through the router, https links in
 * the browser. Anything else is ignored.
 */
export function openNotificationHref(href: string | null): void {
  if (!href || !isSafeNotificationUrl(href)) return;
  if (href.startsWith("/")) router.push(href);
  else void Linking.openURL(href);
}

// Tapping a push opens its `data.url` (set by notify()). Registered once, when
// this file is first imported (the notifications widget and screen import it).
let tapListenerAdded = false;
export function listenForNotificationTaps(): void {
  if (tapListenerAdded) return;
  tapListenerAdded = true;
  Notifications.addNotificationResponseReceivedListener((response) => {
    const data = response.notification.request.content.data;
    const url = data?.url;
    openNotificationHref(typeof url === "string" ? url : null);
  });
}
listenForNotificationTaps();

/**
 * Register for Expo push notifications and persist the token to `mod_notifications_push_tokens`.
 *
 * IMPORTANT: remote push requires a DEV BUILD or a standalone build — Expo Go
 * cannot receive remote push on Android as of SDK 53+. On simulators/emulators
 * (no physical device) this returns null. See README → "Push notifications".
 */
export async function registerForPushNotifications(
  supabase: AppSupabaseClient,
): Promise<string | null> {
  if (!Device.isDevice) return null;

  let permission = await Notifications.getPermissionsAsync();
  if (!permission.granted && permission.canAskAgain) {
    permission = await Notifications.requestPermissionsAsync();
  }
  if (!permission.granted) return null;

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const pushToken = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );
  const token = pushToken.data;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    // A token identifies the DEVICE: the RPC moves it to the signed-in user,
    // so a shared or re-logged-in device stops receiving the previous
    // account's pushes.
    await supabase.rpc("mod_notifications_register_push_token", {
      _token: token,
      _platform: Platform.OS === "ios" ? "ios" : "android",
    });
  }

  return token;
}
