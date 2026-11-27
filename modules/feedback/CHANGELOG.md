# Changelog

## 1.0.0

First release on the Dream registry (`pnpm mod add dream:feedback`).

- Portal with Roadmap · Feedback · Changelog tabs: boards, voting, comments,
  similar-post suggestions, per-board anonymous rules.
- Staff workspace at `/a/feedback`: Inbox, Ideas (scoring), roadmap kanban,
  Posts, Changelog, Insights.
- Ideas drive linked posts' statuses in one transaction; voters are told.
- Changelog in Payload (drafts, scheduled publishing, RSS); the first publish
  ships linked ideas and notifies voters once.
- Issue trackers: GitHub built in (two-way status sync through the Meet Dream
  AI App), with a provider contract for Jira/Linear/Asana adapters.
- Autopilot: embeddings, categorizing, duplicate suggestions/merges with
  undo, smart replies, summaries, changelog drafts, inbound API.
- Feedback from AI chat (Settings → Chat; needs the chat module), formerly
  the `feedback-source-chat` module.
- Staff digest email, embeddable widget (`embed.js`) and MCP tools.
