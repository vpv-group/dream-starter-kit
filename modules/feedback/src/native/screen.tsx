import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { Stack } from "expo-router";

import { Button } from "@acme/ui-native/button";
import { cn } from "@acme/ui-native/cn";
import { Input } from "@acme/ui-native/input";
import { Text } from "@acme/ui-native/text";

import type { Post } from "../data";
import type { Sort } from "../shared/config";
import {
  isAuthRequired,
  useBoardPosts,
  useCreateComment,
  useCreatePost,
  useFeedbackConfig,
  useMyVotes,
  usePostFeed,
  useRoadmapPosts,
  useVote,
  useWhatsNew,
} from "../hooks/use-feedback";
import { TONE_PILL, toneOf } from "../shared/tones";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "";

type View_ =
  { name: "list" } | { name: "post"; post: Post } | { name: "create" };

const SORT_LABELS: Record<Sort, string> = {
  trending: "Trending",
  top: "Top",
  new: "New",
};

/**
 * Native feedback portal: board chips + sort, the post list with vote boxes,
 * a post detail with comments, and create. Same routes and rules as web;
 * anonymous voting needs a signed-in session on native (the app signs in
 * before reaching this tab), so the anonymous path is web-only for now.
 */
export function FeedbackScreen() {
  const config = useFeedbackConfig(API_BASE);
  const [boardId, setBoardId] = useState<string | null>(null);
  const [sort, setSort] = useState<Sort>("trending");
  const [view, setView] = useState<View_>({ name: "list" });
  const [section, setSection] = useState<"roadmap" | "feedback" | "changelog">(
    "feedback",
  );
  const boards = useMemo(
    () => (config.data?.boards ?? []).filter((b) => b.show_on_portal_home),
    [config.data],
  );
  const board = boards.find((b) => b.id === boardId) ?? boards[0];

  if (config.isLoading) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }
  if (!board) {
    return (
      <View className="bg-background flex-1 items-center justify-center p-6">
        <Stack.Screen options={{ title: "Feedback" }} />
        <Text className="text-muted-foreground text-center">
          No feedback boards yet.
        </Text>
      </View>
    );
  }

  if (view.name === "post") {
    return (
      <PostDetail
        post={view.post}
        statuses={config.data?.statuses ?? []}
        onBack={() => setView({ name: "list" })}
      />
    );
  }
  if (view.name === "create") {
    return (
      <CreatePost
        boardId={board.id}
        boardName={board.name}
        onDone={() => setView({ name: "list" })}
      />
    );
  }

  const segments = (
    <View className="flex-row gap-1 px-4 pt-3">
      {(["roadmap", "feedback", "changelog"] as const).map((s) => (
        <Pressable
          key={s}
          onPress={() => setSection(s)}
          className={cn(
            "flex-1 items-center rounded-md py-2",
            section === s ? "bg-primary" : "bg-muted",
          )}
        >
          <Text
            className={cn(
              "text-sm font-semibold",
              section === s
                ? "text-primary-foreground"
                : "text-muted-foreground",
            )}
          >
            {s === "roadmap"
              ? "Roadmap"
              : s === "feedback"
                ? "Feedback"
                : "Changelog"}
          </Text>
        </Pressable>
      ))}
    </View>
  );

  if (section === "changelog") {
    return (
      <View className="bg-background flex-1">
        <Stack.Screen options={{ title: config.data?.title ?? "Feedback" }} />
        {segments}
        <NativeChangelog />
      </View>
    );
  }

  if (section === "roadmap") {
    return (
      <View className="bg-background flex-1">
        <Stack.Screen options={{ title: config.data?.title ?? "Feedback" }} />
        {segments}
        <NativeRoadmap
          statuses={config.data?.statuses ?? []}
          boards={boards}
          onOpen={(post) => setView({ name: "post", post })}
        />
      </View>
    );
  }

  return (
    <View className="bg-background flex-1">
      <Stack.Screen options={{ title: config.data?.title ?? "Feedback" }} />
      {segments}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        className="border-border max-h-14 grow-0 border-b"
        contentContainerClassName="items-center gap-2 px-4"
      >
        {boards.map((b) => (
          <Pressable
            key={b.id}
            onPress={() => setBoardId(b.id)}
            className={cn(
              "rounded-full border px-3 py-1.5",
              b.id === board.id
                ? "border-primary bg-primary/10"
                : "border-border",
            )}
          >
            <Text
              className={cn(
                "text-sm",
                b.id === board.id && "text-primary font-semibold",
              )}
            >
              {b.name} · {b.post_count}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <View className="flex-row items-center justify-between px-4 py-2">
        <View className="flex-row gap-1">
          {(Object.keys(SORT_LABELS) as Sort[]).map((s) => (
            <Pressable
              key={s}
              onPress={() => setSort(s)}
              className={cn("rounded-md px-2 py-1", s === sort && "bg-muted")}
            >
              <Text
                className={cn(
                  "text-sm",
                  s === sort ? "font-semibold" : "text-muted-foreground",
                )}
              >
                {SORT_LABELS[s]}
              </Text>
            </Pressable>
          ))}
        </View>
        {board.allow_new_posts ? (
          <Pressable
            onPress={() => setView({ name: "create" })}
            className="bg-primary rounded-md px-3 py-1.5"
          >
            <Text className="text-primary-foreground text-sm font-semibold">
              Create
            </Text>
          </Pressable>
        ) : null}
      </View>
      <PostList
        boardId={board.id}
        sort={sort}
        statuses={config.data?.statuses ?? []}
        showCounts={board.show_vote_counts}
        onOpen={(post) => setView({ name: "post", post })}
      />
    </View>
  );
}

/** Changelog: the latest entries (titles + excerpts). */
function NativeChangelog() {
  const news = useWhatsNew(API_BASE);
  return (
    <ScrollView contentContainerClassName="gap-4 p-4">
      {(news.data?.entries ?? []).length === 0 ? (
        <Text className="text-muted-foreground text-center">
          No updates yet.
        </Text>
      ) : (
        news.data?.entries.map((e) => (
          <View key={e.id} className="border-border gap-1 border-b pb-4">
            <Text className="text-muted-foreground text-xs">
              {e.publishedAt
                ? new Date(e.publishedAt).toLocaleDateString()
                : ""}
            </Text>
            <Text className="text-lg font-bold">{e.title}</Text>
            {e.excerpt ? <Text className="text-sm">{e.excerpt}</Text> : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}

/** Roadmap: one section per roadmap status, newest status change first. */
function NativeRoadmap({
  statuses,
  boards,
  onOpen,
}: {
  statuses: {
    id: string;
    name: string;
    tone: string;
    show_on_roadmap: boolean;
  }[];
  boards: { id: string; name: string }[];
  onOpen: (p: Post) => void;
}) {
  const columns = statuses.filter((s) => s.show_on_roadmap);
  const posts = useRoadmapPosts(
    columns.map((c) => c.id),
    boards.map((b) => b.id),
  );
  const boardName = new Map(boards.map((b) => [b.id, b.name]));
  return (
    <ScrollView contentContainerClassName="gap-4 p-4">
      {columns.map((col) => {
        const items = (posts.data ?? []).filter((p) => p.status_id === col.id);
        return (
          <View
            key={col.id}
            className="border-border gap-2 rounded-lg border p-3"
          >
            <Text
              className={cn(
                "self-start rounded-full px-2 py-0.5 text-xs font-semibold",
                TONE_PILL[toneOf(col.tone)],
              )}
            >
              {col.name}
            </Text>
            {items.length === 0 ? (
              <Text className="text-muted-foreground text-sm">
                Nothing here yet.
              </Text>
            ) : (
              items.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => onOpen(p)}
                  className="flex-row gap-3 py-1.5"
                >
                  <View className="border-border h-10 w-9 items-center justify-center rounded-md border">
                    <Text className="text-xs font-semibold">
                      {p.vote_count}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium">{p.title}</Text>
                    <Text className="text-muted-foreground text-xs uppercase">
                      {boardName.get(p.board_id) ?? ""}
                    </Text>
                  </View>
                </Pressable>
              ))
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

function PostList({
  boardId,
  sort,
  statuses,
  showCounts,
  onOpen,
}: {
  boardId: string;
  sort: Sort;
  statuses: { id: string; name: string; tone: string; is_default: boolean }[];
  showCounts: boolean;
  onOpen: (p: Post) => void;
}) {
  const posts = useBoardPosts({ boardId, sort });
  const ids = (posts.data ?? []).map((p) => p.id);
  const myVotes = useMyVotes(ids);
  const statusById = new Map(statuses.map((s) => [s.id, s]));

  return (
    <FlatList
      data={posts.data ?? []}
      keyExtractor={(p) => p.id}
      refreshing={posts.isFetching}
      onRefresh={() => void posts.refetch()}
      contentContainerClassName="px-4 pb-8"
      ListEmptyComponent={
        posts.isLoading ? undefined : (
          <Text className="text-muted-foreground py-8 text-center">
            No posts yet.
          </Text>
        )
      }
      renderItem={({ item }) => {
        const st = item.status_id ? statusById.get(item.status_id) : undefined;
        return (
          <Pressable
            onPress={() => onOpen(item)}
            className="border-border flex-row gap-3 border-b py-3"
          >
            <View className="flex-1 gap-1">
              <Text className="font-semibold">{item.title}</Text>
              {item.details ? (
                <Text
                  className="text-muted-foreground text-sm"
                  numberOfLines={2}
                >
                  {item.details}
                </Text>
              ) : null}
              <View className="flex-row items-center gap-2">
                {st && !st.is_default ? (
                  <Text
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs",
                      TONE_PILL[toneOf(st.tone)],
                    )}
                  >
                    {st.name}
                  </Text>
                ) : null}
                <Text className="text-muted-foreground text-xs">
                  💬 {item.comment_count}
                </Text>
              </View>
            </View>
            <VoteBox
              postId={item.id}
              votes={item.vote_count}
              voted={myVotes.data?.has(item.id) ?? false}
              showCount={showCounts}
            />
          </Pressable>
        );
      }}
    />
  );
}

function VoteBox({
  postId,
  votes,
  voted,
  showCount,
}: {
  postId: string;
  votes: number;
  voted: boolean;
  showCount: boolean;
}) {
  const vote = useVote(API_BASE);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: voted }}
      accessibilityLabel={voted ? "Remove your vote" : "Vote"}
      disabled={vote.isPending}
      onPress={() =>
        vote.mutate(
          { postId, voted: !voted, anonAllowed: false },
          {
            onError: (e) =>
              Alert.alert(
                isAuthRequired(e) ? "Sign in to vote" : "Couldn't vote",
                e.message,
              ),
          },
        )
      }
      className={cn(
        "h-12 w-10 items-center justify-center rounded-md border",
        voted ? "border-primary bg-primary/10" : "border-border",
      )}
    >
      <Text className={cn("text-xs", voted && "text-primary")}>▲</Text>
      {showCount ? (
        <Text className={cn("text-xs font-semibold", voted && "text-primary")}>
          {votes}
        </Text>
      ) : null}
    </Pressable>
  );
}

function PostDetail({
  post,
  statuses,
  onBack,
}: {
  post: Post;
  statuses: { id: string; name: string; tone: string }[];
  onBack: () => void;
}) {
  const feed = usePostFeed(post.id);
  const comment = useCreateComment(API_BASE);
  const [body, setBody] = useState("");
  const status = statuses.find((s) => s.id === post.status_id);

  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 p-4"
    >
      <Stack.Screen options={{ title: "Post" }} />
      <Pressable onPress={onBack}>
        <Text className="text-primary">‹ Back</Text>
      </Pressable>
      <View className="flex-row gap-3">
        <VoteBox
          postId={post.id}
          votes={post.vote_count}
          voted={false}
          showCount
        />
        <View className="flex-1 gap-1">
          <Text className="text-xl font-bold">{post.title}</Text>
          {status ? (
            <Text className="text-muted-foreground text-xs font-semibold uppercase">
              {status.name}
            </Text>
          ) : null}
        </View>
      </View>
      {post.details ? <Text className="text-sm">{post.details}</Text> : null}
      <View className="gap-2">
        <Input
          value={body}
          onChangeText={setBody}
          placeholder="Leave a comment"
          multiline
        />
        <Button
          title="Submit"
          loading={comment.isPending}
          disabled={!body.trim()}
          onPress={() =>
            comment.mutate(
              { postId: post.id, body, anonAllowed: false },
              {
                onSuccess: () => setBody(""),
                onError: (e) => Alert.alert("Couldn't comment", e.message),
              },
            )
          }
        />
      </View>
      <Text className="font-semibold">Activity</Text>
      {(feed.data?.items ?? [])
        .slice()
        .reverse()
        .map((i) => {
          const authorId =
            i.kind === "comment" ? i.comment.author_id : i.change.changed_by;
          const name =
            (authorId ? feed.data?.people.get(authorId)?.display_name : null) ??
            "Someone";
          return (
            <View
              key={i.kind === "comment" ? i.comment.id : i.change.id}
              className="border-border gap-1 border-b pb-3"
            >
              <Text className="text-sm font-semibold">{name}</Text>
              <Text className="text-sm">
                {i.kind === "comment"
                  ? i.comment.body
                  : `updated the status to ${statuses.find((s) => s.id === i.change.to_status_id)?.name ?? "—"}${i.change.message ? `\n${i.change.message}` : ""}`}
              </Text>
            </View>
          );
        })}
    </ScrollView>
  );
}

function CreatePost({
  boardId,
  boardName,
  onDone,
}: {
  boardId: string;
  boardName: string;
  onDone: () => void;
}) {
  const create = useCreatePost(API_BASE);
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  return (
    <ScrollView
      className="bg-background flex-1"
      contentContainerClassName="gap-4 p-4"
    >
      <Stack.Screen options={{ title: `New post · ${boardName}` }} />
      <Pressable onPress={onDone}>
        <Text className="text-primary">‹ Cancel</Text>
      </Pressable>
      <Text className="text-muted-foreground text-xs font-semibold uppercase">
        Title
      </Text>
      <Input
        value={title}
        onChangeText={setTitle}
        placeholder="Short, descriptive title"
      />
      <Text className="text-muted-foreground text-xs font-semibold uppercase">
        Details
      </Text>
      <Input
        value={details}
        onChangeText={setDetails}
        placeholder="Any additional details…"
        multiline
      />
      <Button
        title="CREATE POST"
        loading={create.isPending}
        disabled={title.trim().length < 3}
        onPress={() =>
          create.mutate(
            { boardId, title, details, anonAllowed: false },
            {
              onSuccess: onDone,
              onError: (e) => Alert.alert("Couldn't post", e.message),
            },
          )
        }
      />
    </ScrollView>
  );
}
