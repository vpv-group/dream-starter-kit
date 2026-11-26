-- Feedback module · changelog support.
--
-- Changelog ENTRIES are editorial content in Payload (mod-feedback-changelog:
-- rich text, drafts, scheduled publishing, versions). These tables hold the
-- per-person data around them: who subscribed to changelog emails, when each
-- person last read the changelog (the "What's new" unread dot), and likes.

create table if not exists public.mod_feedback_changelog_subscribers (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.mod_feedback_changelog_subscribers enable row level security;

drop policy if exists "mod_feedback_changelog_subscribers: own" on public.mod_feedback_changelog_subscribers;
create policy "mod_feedback_changelog_subscribers: own"
  on public.mod_feedback_changelog_subscribers for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and not (select public.mod_feedback_is_anon()));

create table if not exists public.mod_feedback_changelog_reads (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  last_seen_at timestamptz not null default now()
);
alter table public.mod_feedback_changelog_reads enable row level security;

drop policy if exists "mod_feedback_changelog_reads: own" on public.mod_feedback_changelog_reads;
create policy "mod_feedback_changelog_reads: own"
  on public.mod_feedback_changelog_reads for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and not (select public.mod_feedback_is_anon()));

-- Likes on changelog entries (entry_id = the Payload doc id).
create table if not exists public.mod_feedback_changelog_reactions (
  entry_id text not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (entry_id, user_id)
);
create index if not exists mod_feedback_changelog_reactions_user_idx
  on public.mod_feedback_changelog_reactions (user_id);
alter table public.mod_feedback_changelog_reactions enable row level security;

drop policy if exists "mod_feedback_changelog_reactions: read" on public.mod_feedback_changelog_reactions;
create policy "mod_feedback_changelog_reactions: read"
  on public.mod_feedback_changelog_reactions for select to anon, authenticated
  using (true);

drop policy if exists "mod_feedback_changelog_reactions: write own" on public.mod_feedback_changelog_reactions;
create policy "mod_feedback_changelog_reactions: write own"
  on public.mod_feedback_changelog_reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and not (select public.mod_feedback_is_anon()));

drop policy if exists "mod_feedback_changelog_reactions: delete own" on public.mod_feedback_changelog_reactions;
create policy "mod_feedback_changelog_reactions: delete own"
  on public.mod_feedback_changelog_reactions for delete to authenticated
  using (user_id = (select auth.uid()) and not (select public.mod_feedback_is_anon()));

-- Like counts (+ whether the caller liked) for a set of entries.
create or replace function public.mod_feedback_changelog_likes(_entries text[])
returns table (entry_id text, likes bigint, mine boolean)
language sql
stable
set search_path = ''
as $$
  select r.entry_id, count(*), coalesce(bool_or(r.user_id = (select auth.uid())), false)
  from public.mod_feedback_changelog_reactions r
  where r.entry_id = any (_entries)
  group by r.entry_id;
$$;

-- Same for comment/status likes: `mine` is false (not null) when logged out.
create or replace function public.mod_feedback_reaction_counts(_ids uuid[])
returns table (target_id uuid, likes bigint, mine boolean)
language sql
stable
set search_path = ''
as $$
  select r.target_id, count(*), coalesce(bool_or(r.user_id = (select auth.uid())), false)
  from public.mod_feedback_reactions r
  where r.target_id = any (_ids)
  group by r.target_id;
$$;

-- Anonymous visitors' likes move with them when they sign in.
create or replace function public.mod_feedback_merge_anon(_from uuid, _to uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_feedback_merge_anon: not allowed' using errcode = '42501';
  end if;
  insert into public.mod_feedback_votes (post_id, user_id, priority, created_by, merged_from, created_at)
  select v.post_id, _to, v.priority, v.created_by, v.merged_from, v.created_at
  from public.mod_feedback_votes v
  where v.user_id = _from
  on conflict (post_id, user_id) do nothing;
  delete from public.mod_feedback_votes where user_id = _from;

  update public.mod_feedback_posts set author_id = _to where author_id = _from;
  update public.mod_feedback_comments set author_id = _to where author_id = _from;

  insert into public.mod_feedback_reactions (target_type, target_id, user_id, created_at)
  select r.target_type, r.target_id, _to, r.created_at
  from public.mod_feedback_reactions r where r.user_id = _from
  on conflict do nothing;

  insert into public.mod_feedback_subscriptions (post_id, user_id, reason, created_at)
  select s.post_id, _to, s.reason, s.created_at
  from public.mod_feedback_subscriptions s where s.user_id = _from
  on conflict do nothing;

  insert into public.mod_feedback_changelog_reactions (entry_id, user_id, created_at)
  select r.entry_id, _to, r.created_at
  from public.mod_feedback_changelog_reactions r where r.user_id = _from
  on conflict do nothing;
end;
$$;

select public.mod_notifications_register_category(
  'feedback.changelog.published', 'feedback', 'Shipped updates',
  'Something you voted for shipped, or a changelog entry you subscribed to.', 'client');
