-- Feedback module · Autopilot (AI triage, Canny's Autopilot).
--
-- The cron processes new posts once (ai_processed_at): embeds them, files
-- them into a category, and suggests duplicates in the staff inbox (or, in
-- "automated" mode, merges portal duplicates as votes, logged with undo).
-- Feedback from other sources (the inbound API, the chat adapter) lands in
-- the same inbox and becomes a post only when staff accept it — internal by
-- default, as in Canny. Everything is staff-only.

alter table public.mod_feedback_posts
  add column if not exists embedding extensions.vector(1536),
  add column if not exists ai_processed_at timestamptz,
  add column if not exists summary text,
  add column if not exists summary_comment_count integer;

create index if not exists mod_feedback_posts_embedding_idx
  on public.mod_feedback_posts using hnsw (embedding extensions.vector_cosine_ops);
create index if not exists mod_feedback_posts_unprocessed_idx
  on public.mod_feedback_posts (created_at)
  where ai_processed_at is null and deleted_at is null;

create table if not exists public.mod_feedback_inbox (
  id uuid primary key default gen_random_uuid(),
  -- duplicate (post ↔ post) | extracted (raw feedback from a source)
  kind text not null check (kind in ('duplicate', 'extracted')),
  source text not null default 'portal',
  -- For duplicates: the new post; for extracted feedback: null until accepted.
  post_id uuid references public.mod_feedback_posts (id) on delete cascade,
  suggested_post_id uuid references public.mod_feedback_posts (id) on delete set null,
  suggested_board_id text references public.mod_feedback_boards (id) on delete set null,
  suggested_category_id text references public.mod_feedback_categories (id) on delete set null,
  title text,
  raw_text text,
  author_email text,
  author_name text,
  origin_ref jsonb not null default '{}'::jsonb,
  confidence real,
  state text not null default 'pending'
    check (state in ('pending', 'accepted', 'merged', 'dismissed')),
  resolved_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mod_feedback_inbox_pending_idx
  on public.mod_feedback_inbox (created_at desc) where state = 'pending';
create index if not exists mod_feedback_inbox_post_idx on public.mod_feedback_inbox (post_id);
create index if not exists mod_feedback_inbox_suggested_idx on public.mod_feedback_inbox (suggested_post_id);
create index if not exists mod_feedback_inbox_board_idx on public.mod_feedback_inbox (suggested_board_id);
create index if not exists mod_feedback_inbox_category_idx on public.mod_feedback_inbox (suggested_category_id);
create index if not exists mod_feedback_inbox_resolved_by_idx on public.mod_feedback_inbox (resolved_by);
alter table public.mod_feedback_inbox enable row level security;

drop policy if exists "mod_feedback_inbox: staff" on public.mod_feedback_inbox;
create policy "mod_feedback_inbox: staff"
  on public.mod_feedback_inbox for all to authenticated
  using ((select public.mod_feedback_is_staff()))
  with check ((select public.mod_feedback_is_staff()));

-- Inbound-API keys: only a hash is stored; the key is shown once.
create table if not exists public.mod_feedback_api_keys (
  id uuid primary key default gen_random_uuid(),
  prefix text not null,
  key_hash text not null unique,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists mod_feedback_api_keys_created_by_idx
  on public.mod_feedback_api_keys (created_by);
alter table public.mod_feedback_api_keys enable row level security;

drop policy if exists "mod_feedback_api_keys: staff read" on public.mod_feedback_api_keys;
create policy "mod_feedback_api_keys: staff read"
  on public.mod_feedback_api_keys for select to authenticated
  using ((select public.mod_feedback_is_staff()));

-- Nearest posts by meaning (invoker: only readable posts come back).
create or replace function public.mod_feedback_similar_by_embedding(
  _embedding extensions.vector(1536),
  _board text default null,
  _exclude uuid default null,
  _limit integer default 5
)
returns table (
  id uuid,
  board_id text,
  slug text,
  title text,
  details text,
  status_id text,
  vote_count integer,
  comment_count integer,
  similarity real
)
language sql
stable
set search_path = ''
as $$
  select p.id, p.board_id, p.slug, p.title, left(p.details, 300), p.status_id,
         p.vote_count, p.comment_count,
         (1 - extensions.cosine_distance(p.embedding, _embedding))::real
  from public.mod_feedback_posts p
  where p.embedding is not null
    and p.deleted_at is null
    and p.approval_state = 'approved'
    and p.merged_into_id is null
    and (_board is null or p.board_id = _board)
    and (_exclude is null or p.id <> _exclude)
  order by extensions.cosine_distance(p.embedding, _embedding)
  limit least(greatest(coalesce(_limit, 5), 1), 20);
$$;

-- Every 5 minutes: process new posts and inbox items.
select public.kit_register_app_schedule(
  'mod-feedback-autopilot',
  '*/5 * * * *',
  '/api/mod/feedback/cron/autopilot'
);
