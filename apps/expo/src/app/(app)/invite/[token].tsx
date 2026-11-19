import { useState } from "react";
import { View } from "react-native";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";

import { useSession } from "@acme/api";
import {
  useAcceptInvitation,
  useAuthConfig,
  workspaceErrorMessage,
} from "@acme/app";
import { Button } from "@acme/ui-native/button";
import { Text } from "@acme/ui-native/text";

/**
 * Deep link for an emailed workspace invite (dreamstarter://invite/<token>).
 * Accepting needs the invited, confirmed email signed in — the RPC checks it
 * and the error copy says what to do otherwise.
 */
export default function InviteScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user } = useSession();
  const router = useRouter();
  const settings = useAuthConfig();
  const accept = useAcceptInvitation();
  const [error, setError] = useState<string | null>(null);

  async function onJoin() {
    setError(null);
    try {
      await accept.mutateAsync(token);
      router.replace("/workspaces");
    } catch (e) {
      setError(
        workspaceErrorMessage(
          e as { message?: string },
          settings.workspaceLabel,
        ),
      );
    }
  }

  return (
    <View className="bg-background flex-1 gap-4 p-6">
      <Stack.Screen options={{ title: "Join" }} />
      <Text className="text-2xl font-semibold">You’ve been invited</Text>
      <Text className="text-muted-foreground">
        Join as {user?.email}. Invites only work for the address they were sent
        to.
      </Text>
      {error ? <Text className="text-destructive">{error}</Text> : null}
      <Button
        title="Join"
        loading={accept.isPending}
        onPress={() => void onJoin()}
      />
    </View>
  );
}
