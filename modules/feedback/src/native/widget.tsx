import { View } from "react-native";

import { Text } from "@acme/ui-native/text";

import { useBoardPosts } from "../hooks/use-feedback";

/** Dashboard widget (native): the top trending posts. */
export function FeedbackWidget() {
  const posts = useBoardPosts({ sort: "trending", page: 0 });
  return (
    <View className="border-border w-full gap-1 rounded-md border p-3">
      <Text className="text-muted-foreground text-xs">Trending feedback</Text>
      {(posts.data ?? []).slice(0, 3).map((p) => (
        <Text key={p.id} className="text-sm" numberOfLines={1}>
          {p.vote_count} · {p.title}
        </Text>
      ))}
    </View>
  );
}
