/**
 * Server-rendered portal pages (RSC; Payload Local API + the visitor's own
 * Supabase session). Kept apart from ./web so client islands never pull
 * payload/node code into client chunks.
 */
export { FeedbackIndexPage } from "./index-page";
export { FeedbackBoardPage } from "./board-page";
export { FeedbackCreatePage } from "./create-page";
export { FeedbackPostPage } from "./post-page";
export { FeedbackSearchPage } from "./search-page";
export { RoadmapPage } from "./roadmap-page";
