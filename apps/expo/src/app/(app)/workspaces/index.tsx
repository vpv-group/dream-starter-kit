import { Alert, ScrollView, View } from "react-native";
import { Stack } from "expo-router";

import {
  isWorkspaceMode,
  labelLower,
  useAcceptPendingInvitation,
  useAuthConfig,
  useMyPendingInvitations,
  useMyWorkspaces,
  useProfile,
  useSetActiveOrg,
  useWorkspaceMembers,
  workspaceErrorMessage,
} from "@acme/app";
import { Button } from "@acme/ui-native/button";
import { Text } from "@acme/ui-native/text";

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/**
 * Workspaces on mobile (docs/WORKSPACES.md): switch the active workspace
 * (profiles.last_org_id, shared with web), join pending invitations, and see
 * who's in the active workspace. Reached from the Profile screen.
 */
export default function WorkspacesScreen() {
  const settings = useAuthConfig();
  const label = settings.workspaceLabel;
  const profile = useProfile();
  const workspaces = useMyWorkspaces();
  const pending = useMyPendingInvitations();
  const setActive = useSetActiveOrg();
  const accept = useAcceptPendingInvitation();

  const list = workspaces.data ?? [];
  const activeId =
    list.find((w) => w.id === profile.data?.last_org_id)?.id ?? list[0]?.id;
  const members = useWorkspaceMembers(activeId);

  if (!isWorkspaceMode(settings)) {
    return (
      <View className="bg-background flex-1 p-6">
        <Stack.Screen options={{ title: `${label}s` }} />
        <Text className="text-muted-foreground">
          This app doesn’t use {labelLower(label)}s.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-6 p-6"
    >
      <Stack.Screen options={{ title: `${label}s` }} />

      {(pending.data ?? []).length > 0 ? (
        <View className="gap-3">
          <Text className="text-lg font-semibold">You’ve been invited</Text>
          {(pending.data ?? []).map((invite) => (
            <View
              key={invite.invitationId}
              className="border-border gap-2 rounded-lg border p-4"
            >
              <Text className="font-medium">{invite.orgName}</Text>
              <Text className="text-muted-foreground text-sm">
                {invite.inviterName
                  ? `Invited by ${invite.inviterName} · `
                  : ""}
                {ROLE[invite.role as keyof typeof ROLE]}
              </Text>
              <Button
                title="Join"
                loading={accept.isPending}
                onPress={() =>
                  void accept
                    .mutateAsync(invite.invitationId)
                    .catch((e: unknown) =>
                      Alert.alert(
                        "Couldn't join",
                        workspaceErrorMessage(e as { message?: string }, label),
                      ),
                    )
                }
              />
            </View>
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        <Text className="text-lg font-semibold">Your {labelLower(label)}s</Text>
        {list.length === 0 ? (
          <Text className="text-muted-foreground">
            You’re not in a {labelLower(label)} yet. Create one on the web, or
            ask a teammate to invite you.
          </Text>
        ) : (
          list.map((w) => (
            <View
              key={w.id}
              className="border-border flex-row items-center justify-between gap-3 rounded-lg border p-4"
            >
              <View className="flex-1">
                <Text className="font-medium">{w.name}</Text>
                <Text className="text-muted-foreground text-sm">
                  {ROLE[w.role]}
                  {w.id === activeId ? " · Active" : ""}
                </Text>
              </View>
              {w.id !== activeId ? (
                <Button
                  title="Switch"
                  variant="outline"
                  loading={setActive.isPending}
                  onPress={() =>
                    void setActive
                      .mutateAsync(w.id)
                      .then(() => profile.refetch())
                      .catch((e: unknown) =>
                        Alert.alert(
                          "Couldn't switch",
                          workspaceErrorMessage(
                            e as { message?: string },
                            label,
                          ),
                        ),
                      )
                  }
                />
              ) : null}
            </View>
          ))
        )}
      </View>

      {activeId ? (
        <View className="gap-3">
          <Text className="text-lg font-semibold">Members</Text>
          {(members.data ?? []).map((m) => (
            <View
              key={m.userId}
              className="border-border flex-row items-center justify-between rounded-lg border p-4"
            >
              <View className="flex-1">
                <Text className="font-medium">
                  {m.displayName ?? m.email}
                  {m.isYou ? " (you)" : ""}
                </Text>
                <Text className="text-muted-foreground text-sm">
                  {[m.email, m.title].filter(Boolean).join(" · ")}
                </Text>
              </View>
              <Text className="text-muted-foreground text-sm">
                {ROLE[m.role]}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}
