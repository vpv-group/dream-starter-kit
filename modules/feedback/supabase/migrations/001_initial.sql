-- Feedback module · initial schema (Canny-style boards, posts, votes, comments).
--
-- Two kinds of tables:
--  • CONFIG PROJECTIONS (boards, categories, statuses, tags): authored in
--    Payload (/admin → Feedback) and copied here by the module's afterChange
--    hooks with the service role, so RLS and joins can use them. Read-only for
--    clients; ids are Payload's (text).
--  • FEEDBACK DATA (posts, votes, comments, reactions, subscriptions, status
--    history, activity): written by members through RLS, by anonymous
--    visitors only through the module's public routes (service role, after
--    the board's anonymous setting is checked), and by staff.
--
-- Golden rule #1: every table has RLS; anonymous JWTs can never write (a
-- RESTRICTIVE policy per write command). Server-controlled columns are
-- forced by BEFORE triggers, so an RLS insert can't spoof them.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Staff = profiles.is_staff (follows the CMS roles). Wrapped in (select …) at
-- call sites so it runs once per statement.
create or replace function public.mod_feedback_is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.is_staff from public.profiles p where p.id = (select auth.uid())),
    false
  );
$$;

create or replace function public.mod_feedback_is_anon()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false);
$$;

create or replace function public.mod_feedback_is_service()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.role()), '') = 'service_role';
$$;

create or replace function public.mod_feedback_slugify(_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      left(
        trim(both '-' from regexp_replace(lower(coalesce(_text, '')), '[^a-z0-9]+', '-', 'g')),
        80
      ),
      ''
    ),
    'post'
  );
$$;

-- ---------------------------------------------------------------------------
-- Config projections (from Payload)
-- ---------------------------------------------------------------------------

create table if not exists public.mod_feedback_boards (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  position integer not null default 0,
  -- staff (Canny "Private") | public | members | segment (core tag names)
  access text not null default 'staff'
    check (access in ('staff', 'public', 'members', 'segment')),
  segment_tags text[] not null default '{}',
  show_on_portal_home boolean not null default true,
  search_indexing boolean not null default false,
  allow_new_posts boolean not null default true,
  -- inherit | allow | deny (inherit = the module's global default)
  anon_votes text not null default 'inherit' check (anon_votes in ('inherit', 'allow', 'deny')),
  anon_posts text not null default 'inherit' check (anon_posts in ('inherit', 'allow', 'deny')),
  anon_comments text not null default 'inherit' check (anon_comments in ('inherit', 'allow', 'deny')),
  require_approval boolean not null default false,
  show_vote_counts boolean not null default true,
  show_voters boolean not null default true,
  show_dates boolean not null default true,
  show_comments_publicly boolean not null default true,
  disable_votes_when_done boolean not null default false,
  disable_comments_when_done boolean not null default false,
  -- Create Post Form copy + custom fields + attachments (see Boards collection)
  form jsonb not null default '{}'::jsonb,
  archived boolean not null default false,
  synced_at timestamptz not null default now()
);

create table if not exists public.mod_feedback_categories (
  id text primary key,
  board_id text not null references public.mod_feedback_boards (id) on delete cascade,
  parent_id text references public.mod_feedback_categories (id) on delete set null,
  name text not null,
  slug text not null,
  position integer not null default 0,
  archived boolean not null default false
);
create index if not exists mod_feedback_categories_board_idx on public.mod_feedback_categories (board_id);
create index if not exists mod_feedback_categories_parent_idx on public.mod_feedback_categories (parent_id);

create table if not exists public.mod_feedback_statuses (
  id text primary key,
  name text not null,
  -- open (the initial "Open") | active | complete | closed
  type text not null check (type in ('open', 'active', 'complete', 'closed')),
  tone text not null default 'neutral'
    check (tone in ('neutral', 'info', 'warning', 'success', 'destructive')),
  position integer not null default 0,
  show_on_roadmap boolean not null default false,
  is_default boolean not null default false,
  notify_by_default boolean not null default true,
  archived boolean not null default false
);

create table if not exists public.mod_feedback_tags (
  id text primary key,
  name text not null,
  tone text not null default 'neutral'
    check (tone in ('neutral', 'info', 'warning', 'success', 'destructive')),
  position integer not null default 0,
  archived boolean not null default false
);

-- Boards the caller may read. Definer + initplan-friendly: policies use
-- `board_id = any (array(select public.mod_feedback_readable_board_ids()))`.
create or replace function public.mod_feedback_readable_board_ids()
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
  from public.mod_feedback_boards b
  where not b.archived
    and (
      b.access = 'public'
      or (select public.mod_feedback_is_staff())
      or (
        b.access = 'members'
        and (select auth.uid()) is not null
        and not (select public.mod_feedback_is_anon())
      )
      or (
        b.access = 'segment'
        and (select auth.uid()) is not null
        and exists (
          select 1
          from public.user_tags ut
          join public.tags t on t.id = ut.tag_id
          where ut.user_id = (select auth.uid())
            and t.name = any (b.segment_tags)
        )
      )
    );
$$;

alter table public.mod_feedback_boards enable row level security;
alter table public.mod_feedback_categories enable row level security;
alter table public.mod_feedback_statuses enable row level security;
alter table public.mod_feedback_tags enable row level security;

drop policy if exists "mod_feedback_boards: read" on public.mod_feedback_boards;
create policy "mod_feedback_boards: read"
  on public.mod_feedback_boards for select to anon, authenticated
  using (id = any (array(select public.mod_feedback_readable_board_ids())));

drop policy if exists "mod_feedback_categories: read" on public.mod_feedback_categories;
create policy "mod_feedback_categories: read"
  on public.mod_feedback_categories for select to anon, authenticated
  using (board_id = any (array(select public.mod_feedback_readable_board_ids())));

drop policy if exists "mod_feedback_statuses: read" on public.mod_feedback_statuses;
create policy "mod_feedback_statuses: read"
  on public.mod_feedback_statuses for select to anon, authenticated
  using (true);

drop policy if exists "mod_feedback_tags: staff read" on public.mod_feedback_tags;
create policy "mod_feedback_tags: staff read"
  on public.mod_feedback_tags for select to authenticated
  using ((select public.mod_feedback_is_staff()));

-- ---------------------------------------------------------------------------
-- Posts
-- ---------------------------------------------------------------------------

create table if not exists public.mod_feedback_posts (
  id uuid primary key default gen_random_uuid(),
  board_id text not null references public.mod_feedback_boards (id) on delete restrict,
  category_id text references public.mod_feedback_categories (id) on delete set null,
  status_id text references public.mod_feedback_statuses (id) on delete set null,
  author_id uuid references public.profiles (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  title text not null check (char_length(title) between 1 and 400),
  details text not null default '' check (char_length(details) <= 10000),
  slug text not null,
  custom_fields jsonb not null default '{}'::jsonb,
  -- [{ id, url, name, mime }] — Payload Media uploads
  attachments jsonb not null default '[]'::jsonb,
  eta date,
  eta_public boolean not null default false,
  vote_count integer not null default 0,
  comment_count integer not null default 0,
  -- Decayed vote score for the Trending sort (half-life 7 days, see trigger).
  trend_score double precision not null default 0,
  trend_at timestamptz not null default now(),
  merged_into_id uuid references public.mod_feedback_posts (id) on delete set null,
  approval_state text not null default 'approved'
    check (approval_state in ('pending', 'approved', 'rejected')),
  pinned boolean not null default false,
  source text not null default 'portal',
  source_ref jsonb not null default '{}'::jsonb,
  search tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
    || setweight(to_tsvector('english', coalesce(details, '')), 'B')
  ) stored,
  status_changed_at timestamptz not null default now(),
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (board_id, slug)
);

create index if not exists mod_feedback_posts_board_idx
  on public.mod_feedback_posts (board_id, created_at desc);
create index if not exists mod_feedback_posts_status_idx
  on public.mod_feedback_posts (status_id, status_changed_at desc);
create index if not exists mod_feedback_posts_author_idx on public.mod_feedback_posts (author_id);
create index if not exists mod_feedback_posts_owner_idx on public.mod_feedback_posts (owner_id);
create index if not exists mod_feedback_posts_category_idx on public.mod_feedback_posts (category_id);
create index if not exists mod_feedback_posts_merged_idx on public.mod_feedback_posts (merged_into_id);
create index if not exists mod_feedback_posts_search_idx
  on public.mod_feedback_posts using gin (search);
create index if not exists mod_feedback_posts_title_trgm_idx
  on public.mod_feedback_posts using gin (title extensions.gin_trgm_ops);

alter table public.mod_feedback_posts enable row level security;

-- Readable: board readable, not deleted, and approved — or your own / staff.
drop policy if exists "mod_feedback_posts: read" on public.mod_feedback_posts;
create policy "mod_feedback_posts: read"
  on public.mod_feedback_posts for select to anon, authenticated
  using (
    board_id = any (array(select public.mod_feedback_readable_board_ids()))
    and (
      (select public.mod_feedback_is_staff())
      or (
        deleted_at is null
        and (approval_state = 'approved' or author_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "mod_feedback_posts: insert own" on public.mod_feedback_posts;
create policy "mod_feedback_posts: insert own"
  on public.mod_feedback_posts for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and board_id = any (array(select public.mod_feedback_readable_board_ids()))
  );

drop policy if exists "mod_feedback_posts: update own or staff" on public.mod_feedback_posts;
create policy "mod_feedback_posts: update own or staff"
  on public.mod_feedback_posts for update to authenticated
  using (author_id = (select auth.uid()) or (select public.mod_feedback_is_staff()))
  with check (author_id = (select auth.uid()) or (select public.mod_feedback_is_staff()));

drop policy if exists "mod_feedback_posts: delete staff" on public.mod_feedback_posts;
create policy "mod_feedback_posts: delete staff"
  on public.mod_feedback_posts for delete to authenticated
  using ((select public.mod_feedback_is_staff()));

-- Server-controlled columns on insert: status, approval, counters, slug.
create or replace function public.mod_feedback_posts_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _board public.mod_feedback_boards%rowtype;
  _base text;
  _slug text;
  _n integer := 1;
  -- Staff, and server-side imports (source other than 'portal'), may set any
  -- column. Portal posts — including anonymous ones the module writes with
  -- the service role — always get the board's rules.
  _privileged boolean := public.mod_feedback_is_staff()
    or (public.mod_feedback_is_service() and coalesce(new.source, 'portal') <> 'portal');
begin
  select * into _board from public.mod_feedback_boards where id = new.board_id;
  if not found or _board.archived then
    raise exception 'Unknown board' using errcode = '23503';
  end if;
  if not _privileged and not _board.allow_new_posts then
    raise exception 'This board is not accepting new posts' using errcode = '42501';
  end if;

  if not _privileged then
    new.status_id := null;
    new.owner_id := null;
    new.eta := null;
    new.eta_public := false;
    new.merged_into_id := null;
    new.pinned := false;
    new.source := 'portal';
    new.source_ref := '{}'::jsonb;
    new.category_id := case
      when exists (
        select 1 from public.mod_feedback_categories c
        where c.id = new.category_id and c.board_id = new.board_id and not c.archived
      ) then new.category_id
    end;
    new.approval_state := case when _board.require_approval then 'pending' else 'approved' end;
  end if;

  if new.status_id is null then
    select s.id into new.status_id
    from public.mod_feedback_statuses s
    where s.is_default and not s.archived
    order by s.position
    limit 1;
  end if;

  new.vote_count := 0;
  new.comment_count := 0;
  new.trend_score := 0;
  new.trend_at := now();
  new.deleted_at := null;
  new.created_at := now();
  new.updated_at := now();
  new.status_changed_at := now();

  _base := public.mod_feedback_slugify(new.title);
  _slug := _base;
  while exists (
    select 1 from public.mod_feedback_posts p where p.board_id = new.board_id and p.slug = _slug
  ) loop
    _n := _n + 1;
    _slug := _base || '-' || _n;
  end loop;
  new.slug := _slug;
  return new;
end;
$$;

drop trigger if exists mod_feedback_posts_before_insert on public.mod_feedback_posts;
create trigger mod_feedback_posts_before_insert
  before insert on public.mod_feedback_posts
  for each row execute function public.mod_feedback_posts_before_insert();

-- Authors may only edit title/details/custom fields; staff and the service
-- role edit anything except the counters (kept by triggers).
create or replace function public.mod_feedback_posts_before_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (public.mod_feedback_is_service() or public.mod_feedback_is_staff()) then
    if new.board_id is distinct from old.board_id
      or new.category_id is distinct from old.category_id
      or new.status_id is distinct from old.status_id
      or new.author_id is distinct from old.author_id
      or new.owner_id is distinct from old.owner_id
      or new.eta is distinct from old.eta
      or new.eta_public is distinct from old.eta_public
      or new.merged_into_id is distinct from old.merged_into_id
      or new.approval_state is distinct from old.approval_state
      or new.pinned is distinct from old.pinned
      or new.source is distinct from old.source
      or new.source_ref is distinct from old.source_ref
      or new.deleted_at is distinct from old.deleted_at
      or new.slug is distinct from old.slug
    then
      raise exception 'Only staff can change that' using errcode = '42501';
    end if;
  end if;
  if pg_trigger_depth() <= 1 then
    -- Counters move only through the vote/comment triggers.
    new.vote_count := old.vote_count;
    new.comment_count := old.comment_count;
    new.trend_score := old.trend_score;
    new.trend_at := old.trend_at;
  end if;
  if new.status_id is distinct from old.status_id then
    new.status_changed_at := now();
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mod_feedback_posts_before_update on public.mod_feedback_posts;
create trigger mod_feedback_posts_before_update
  before update on public.mod_feedback_posts
  for each row execute function public.mod_feedback_posts_before_update();

-- Staff tags on posts.
create table if not exists public.mod_feedback_post_tags (
  post_id uuid not null references public.mod_feedback_posts (id) on delete cascade,
  tag_id text not null references public.mod_feedback_tags (id) on delete cascade,
  primary key (post_id, tag_id)
);
create index if not exists mod_feedback_post_tags_tag_idx on public.mod_feedback_post_tags (tag_id);
alter table public.mod_feedback_post_tags enable row level security;

drop policy if exists "mod_feedback_post_tags: staff" on public.mod_feedback_post_tags;
create policy "mod_feedback_post_tags: staff"
  on public.mod_feedback_post_tags for all to authenticated
  using ((select public.mod_feedback_is_staff()))
  with check ((select public.mod_feedback_is_staff()));

-- ---------------------------------------------------------------------------
-- Votes
-- ---------------------------------------------------------------------------

create table if not exists public.mod_feedback_votes (
  post_id uuid not null references public.mod_feedback_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  priority text check (priority in ('nice', 'important', 'must')),
  -- Staff member who voted on the user's behalf (null = the user voted).
  created_by uuid references public.profiles (id) on delete set null,
  -- Set on votes copied into a merge target (unmerge removes them).
  merged_from uuid references public.mod_feedback_posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists mod_feedback_votes_user_idx on public.mod_feedback_votes (user_id);
create index if not exists mod_feedback_votes_created_by_idx on public.mod_feedback_votes (created_by);
create index if not exists mod_feedback_votes_merged_idx on public.mod_feedback_votes (merged_from);

alter table public.mod_feedback_votes enable row level security;

drop policy if exists "mod_feedback_votes: read own or staff" on public.mod_feedback_votes;
create policy "mod_feedback_votes: read own or staff"
  on public.mod_feedback_votes for select to authenticated
  using (user_id = (select auth.uid()) or (select public.mod_feedback_is_staff()));

drop policy if exists "mod_feedback_votes: insert own" on public.mod_feedback_votes;
create policy "mod_feedback_votes: insert own"
  on public.mod_feedback_votes for insert to authenticated
  with check (user_id = (select auth.uid()) or (select public.mod_feedback_is_staff()));

drop policy if exists "mod_feedback_votes: delete own or staff" on public.mod_feedback_votes;
create policy "mod_feedback_votes: delete own or staff"
  on public.mod_feedback_votes for delete to authenticated
  using (user_id = (select auth.uid()) or (select public.mod_feedback_is_staff()));

-- A vote needs a readable, approved, live post whose board still takes votes.
create or replace function public.mod_feedback_votes_before_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ok boolean;
  _privileged boolean := public.mod_feedback_is_service() or public.mod_feedback_is_staff();
begin
  if not _privileged then
    new.created_by := null;
    new.merged_from := null;
    new.priority := null;
  end if;
  if new.merged_from is not null then
    return new; -- merge copies are written by the merge function
  end if;
  select (
    p.deleted_at is null
    and p.approval_state = 'approved'
    and p.merged_into_id is null
    and (
      _privileged
      or p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
    )
    and not (
      b.disable_votes_when_done
      and coalesce(s.type in ('complete', 'closed'), false)
    )
  ) into _ok
  from public.mod_feedback_posts p
  join public.mod_feedback_boards b on b.id = p.board_id
  left join public.mod_feedback_statuses s on s.id = p.status_id
  where p.id = new.post_id;
  if not coalesce(_ok, false) then
    raise exception 'Voting is closed for this post' using errcode = '42501';
  end if;
  new.created_at := now();
  return new;
end;
$$;

drop trigger if exists mod_feedback_votes_before_insert on public.mod_feedback_votes;
create trigger mod_feedback_votes_before_insert
  before insert on public.mod_feedback_votes
  for each row execute function public.mod_feedback_votes_before_insert();

-- Counters + Trending score (exponential decay, half-life 7 days) + auto-follow.
create or replace function public.mod_feedback_votes_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _half_life constant double precision := 7 * 24 * 3600;
begin
  if tg_op = 'INSERT' then
    update public.mod_feedback_posts p
    set vote_count = p.vote_count + 1,
        trend_score = p.trend_score
          * exp(-ln(2) * extract(epoch from (now() - p.trend_at)) / _half_life) + 1,
        trend_at = now()
    where p.id = new.post_id;
    insert into public.mod_feedback_subscriptions (post_id, user_id, reason)
    values (new.post_id, new.user_id, 'vote')
    on conflict (post_id, user_id) do nothing;
    return new;
  else
    update public.mod_feedback_posts p
    set vote_count = greatest(p.vote_count - 1, 0),
        trend_score = greatest(
          p.trend_score
            * exp(-ln(2) * extract(epoch from (now() - p.trend_at)) / _half_life) - 1,
          0
        ),
        trend_at = now()
    where p.id = old.post_id;
    return old;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Comments, reactions, subscriptions
-- ---------------------------------------------------------------------------

create table if not exists public.mod_feedback_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.mod_feedback_posts (id) on delete cascade,
  author_id uuid references public.profiles (id) on delete set null,
  parent_id uuid references public.mod_feedback_comments (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 10000),
  attachments jsonb not null default '[]'::jsonb,
  is_internal boolean not null default false,
  pinned boolean not null default false,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mod_feedback_comments_post_idx
  on public.mod_feedback_comments (post_id, created_at);
create index if not exists mod_feedback_comments_author_idx on public.mod_feedback_comments (author_id);
create index if not exists mod_feedback_comments_parent_idx on public.mod_feedback_comments (parent_id);

alter table public.mod_feedback_comments enable row level security;

drop policy if exists "mod_feedback_comments: read" on public.mod_feedback_comments;
create policy "mod_feedback_comments: read"
  on public.mod_feedback_comments for select to anon, authenticated
  using (
    (select public.mod_feedback_is_staff())
    or (
      not is_internal
      and deleted_at is null
      and exists (
        select 1
        from public.mod_feedback_posts p
        join public.mod_feedback_boards b on b.id = p.board_id
        where p.id = post_id
          and p.deleted_at is null
          and p.approval_state = 'approved'
          and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
          and (b.show_comments_publicly or author_id = (select auth.uid()))
      )
    )
  );

drop policy if exists "mod_feedback_comments: insert own" on public.mod_feedback_comments;
create policy "mod_feedback_comments: insert own"
  on public.mod_feedback_comments for insert to authenticated
  with check (author_id = (select auth.uid()));

drop policy if exists "mod_feedback_comments: update own or staff" on public.mod_feedback_comments;
create policy "mod_feedback_comments: update own or staff"
  on public.mod_feedback_comments for update to authenticated
  using (author_id = (select auth.uid()) or (select public.mod_feedback_is_staff()))
  with check (author_id = (select auth.uid()) or (select public.mod_feedback_is_staff()));

drop policy if exists "mod_feedback_comments: delete staff" on public.mod_feedback_comments;
create policy "mod_feedback_comments: delete staff"
  on public.mod_feedback_comments for delete to authenticated
  using ((select public.mod_feedback_is_staff()));

create or replace function public.mod_feedback_comments_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ok boolean;
  _staff boolean := public.mod_feedback_is_staff();
  _service boolean := public.mod_feedback_is_service();
  _privileged boolean := _staff or _service;
begin
  if tg_op = 'INSERT' then
    if not _privileged then
      new.is_internal := false;
      new.pinned := false;
    end if;
    -- Anyone but staff (anonymous comments arrive via the service role)
    -- comments only on live posts whose board still takes comments.
    if not _staff then
      select (
        p.deleted_at is null
        and p.approval_state = 'approved'
        and (_service or p.board_id = any (array(select public.mod_feedback_readable_board_ids())))
        and not (
          b.disable_comments_when_done
          and coalesce(s.type in ('complete', 'closed'), false)
        )
      ) into _ok
      from public.mod_feedback_posts p
      join public.mod_feedback_boards b on b.id = p.board_id
      left join public.mod_feedback_statuses s on s.id = p.status_id
      where p.id = new.post_id;
      if not coalesce(_ok, false) then
        raise exception 'Comments are closed for this post' using errcode = '42501';
      end if;
    end if;
    if new.parent_id is not null and not exists (
      select 1 from public.mod_feedback_comments c
      where c.id = new.parent_id and c.post_id = new.post_id
    ) then
      raise exception 'Reply must be on the same post' using errcode = '23503';
    end if;
    new.edited_at := null;
    new.deleted_at := null;
    new.created_at := now();
  else
    if not _privileged and (
      new.post_id is distinct from old.post_id
      or new.author_id is distinct from old.author_id
      or new.parent_id is distinct from old.parent_id
      or new.is_internal is distinct from old.is_internal
      or new.pinned is distinct from old.pinned
    ) then
      raise exception 'Only staff can change that' using errcode = '42501';
    end if;
    if new.body is distinct from old.body then
      new.edited_at := now();
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists mod_feedback_comments_before_write on public.mod_feedback_comments;
create trigger mod_feedback_comments_before_write
  before insert or update on public.mod_feedback_comments
  for each row execute function public.mod_feedback_comments_before_write();

create or replace function public.mod_feedback_comments_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not new.is_internal then
      update public.mod_feedback_posts set comment_count = comment_count + 1
      where id = new.post_id;
    end if;
    if new.author_id is not null and not new.is_internal then
      insert into public.mod_feedback_subscriptions (post_id, user_id, reason)
      values (new.post_id, new.author_id, 'comment')
      on conflict (post_id, user_id) do nothing;
    end if;
    return new;
  elsif tg_op = 'UPDATE' then
    if (old.deleted_at is null and not old.is_internal)
       <> (new.deleted_at is null and not new.is_internal) then
      update public.mod_feedback_posts
      set comment_count = greatest(
        comment_count + case when new.deleted_at is null and not new.is_internal then 1 else -1 end,
        0
      )
      where id = new.post_id;
    end if;
    return new;
  else
    if old.deleted_at is null and not old.is_internal then
      update public.mod_feedback_posts set comment_count = greatest(comment_count - 1, 0)
      where id = old.post_id;
    end if;
    return old;
  end if;
end;
$$;

drop trigger if exists mod_feedback_comments_after_change on public.mod_feedback_comments;
create trigger mod_feedback_comments_after_change
  after insert or update or delete on public.mod_feedback_comments
  for each row execute function public.mod_feedback_comments_after_change();

create table if not exists public.mod_feedback_subscriptions (
  post_id uuid not null references public.mod_feedback_posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  reason text not null default 'manual' check (reason in ('post', 'vote', 'comment', 'manual')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists mod_feedback_subscriptions_user_idx on public.mod_feedback_subscriptions (user_id);
alter table public.mod_feedback_subscriptions enable row level security;

drop policy if exists "mod_feedback_subscriptions: own" on public.mod_feedback_subscriptions;
create policy "mod_feedback_subscriptions: own"
  on public.mod_feedback_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- The vote trigger inserts subscriptions, so it is created after the table.
drop trigger if exists mod_feedback_votes_after_change on public.mod_feedback_votes;
create trigger mod_feedback_votes_after_change
  after insert or delete on public.mod_feedback_votes
  for each row execute function public.mod_feedback_votes_after_change();

create or replace function public.mod_feedback_posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.author_id is not null then
    insert into public.mod_feedback_subscriptions (post_id, user_id, reason)
    values (new.id, new.author_id, 'post')
    on conflict (post_id, user_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists mod_feedback_posts_after_insert on public.mod_feedback_posts;
create trigger mod_feedback_posts_after_insert
  after insert on public.mod_feedback_posts
  for each row execute function public.mod_feedback_posts_after_insert();

-- Status history (rendered in the post's activity feed).
create table if not exists public.mod_feedback_status_changes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.mod_feedback_posts (id) on delete cascade,
  from_status_id text references public.mod_feedback_statuses (id) on delete set null,
  to_status_id text references public.mod_feedback_statuses (id) on delete set null,
  changed_by uuid references public.profiles (id) on delete set null,
  -- user | idea | provider:<id> | autopilot
  origin text not null default 'user',
  message text,
  notified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists mod_feedback_status_changes_post_idx
  on public.mod_feedback_status_changes (post_id, created_at);
create index if not exists mod_feedback_status_changes_by_idx
  on public.mod_feedback_status_changes (changed_by);
create index if not exists mod_feedback_status_changes_from_idx
  on public.mod_feedback_status_changes (from_status_id);
create index if not exists mod_feedback_status_changes_to_idx
  on public.mod_feedback_status_changes (to_status_id);
alter table public.mod_feedback_status_changes enable row level security;

drop policy if exists "mod_feedback_status_changes: read" on public.mod_feedback_status_changes;
create policy "mod_feedback_status_changes: read"
  on public.mod_feedback_status_changes for select to anon, authenticated
  using (
    exists (
      select 1 from public.mod_feedback_posts p
      where p.id = post_id
        and p.deleted_at is null
        and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
    )
  );

-- Likes on comments and status-change items.
create table if not exists public.mod_feedback_reactions (
  target_type text not null check (target_type in ('comment', 'status_change')),
  target_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (target_type, target_id, user_id)
);
create index if not exists mod_feedback_reactions_user_idx on public.mod_feedback_reactions (user_id);
alter table public.mod_feedback_reactions enable row level security;

drop policy if exists "mod_feedback_reactions: read" on public.mod_feedback_reactions;
create policy "mod_feedback_reactions: read"
  on public.mod_feedback_reactions for select to anon, authenticated
  using (true);

drop policy if exists "mod_feedback_reactions: write own" on public.mod_feedback_reactions;
create policy "mod_feedback_reactions: write own"
  on public.mod_feedback_reactions for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "mod_feedback_reactions: delete own" on public.mod_feedback_reactions;
create policy "mod_feedback_reactions: delete own"
  on public.mod_feedback_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

-- Audit log with undo payloads (merges, Autopilot). Staff read; server writes.
create table if not exists public.mod_feedback_activity (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  data jsonb not null default '{}'::jsonb,
  undone_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mod_feedback_activity_target_idx
  on public.mod_feedback_activity (target_type, target_id, created_at desc);
create index if not exists mod_feedback_activity_actor_idx on public.mod_feedback_activity (actor_id);
alter table public.mod_feedback_activity enable row level security;

drop policy if exists "mod_feedback_activity: staff read" on public.mod_feedback_activity;
create policy "mod_feedback_activity: staff read"
  on public.mod_feedback_activity for select to authenticated
  using ((select public.mod_feedback_is_staff()));

-- Anonymous JWTs never write (golden rule #1). Their writes go through the
-- module's public routes, which use the service role after checking settings.
do $$
declare
  _t text;
  _cmd text;
begin
  foreach _t in array array[
    'mod_feedback_posts', 'mod_feedback_votes', 'mod_feedback_comments',
    'mod_feedback_reactions', 'mod_feedback_subscriptions', 'mod_feedback_post_tags'
  ] loop
    foreach _cmd in array array['insert', 'update', 'delete'] loop
      execute format('drop policy if exists %I on public.%I', _t || ': no anon ' || _cmd, _t);
      if _cmd = 'insert' then
        execute format(
          'create policy %I on public.%I as restrictive for insert to authenticated '
          || 'with check (not (select public.mod_feedback_is_anon()))',
          _t || ': no anon ' || _cmd, _t);
      else
        execute format(
          'create policy %I on public.%I as restrictive for %s to authenticated '
          || 'using (not (select public.mod_feedback_is_anon()))',
          _t || ': no anon ' || _cmd, _t, _cmd);
      end if;
    end loop;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Read helpers (RPC)
-- ---------------------------------------------------------------------------

-- Board list with visible-post counts (RLS applies: invoker).
create or replace function public.mod_feedback_board_counts()
returns table (board_id text, post_count bigint)
language sql
stable
set search_path = ''
as $$
  select p.board_id, count(*)
  from public.mod_feedback_posts p
  where p.deleted_at is null
    and p.approval_state = 'approved'
    and p.merged_into_id is null
  group by p.board_id;
$$;

-- Similar posts for the create form ("Similar feedback") and search:
-- full-text + trigram. Invoker, so only readable posts come back.
create or replace function public.mod_feedback_similar_posts(
  _q text,
  _board text default null,
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
  score real
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select websearch_to_tsquery('english', coalesce(_q, '')) as ts,
           coalesce(_q, '') as raw
  )
  select p.id, p.board_id, p.slug, p.title, left(p.details, 300), p.status_id,
         p.vote_count, p.comment_count,
         (ts_rank(p.search, q.ts) + extensions.similarity(p.title, q.raw))::real as score
  from public.mod_feedback_posts p, q
  where char_length(trim(q.raw)) >= 3
    and p.deleted_at is null
    and p.approval_state = 'approved'
    and p.merged_into_id is null
    and (_board is null or p.board_id = _board)
    and (p.search @@ q.ts or extensions.similarity(p.title, q.raw) > 0.2)
  order by score desc, p.vote_count desc
  limit least(greatest(coalesce(_limit, 5), 1), 50);
$$;

-- Board/portal post list (invoker: RLS decides what's visible). Trending =
-- the vote score decayed to now (half-life 7 days); pinned posts first.
create or replace function public.mod_feedback_list_posts(
  _board text default null,
  _sort text default 'trending',
  _statuses text[] default null,
  _q text default null,
  _limit integer default 20,
  _offset integer default 0
)
returns setof public.mod_feedback_posts
language sql
stable
set search_path = ''
as $$
  select p.*
  from public.mod_feedback_posts p
  where p.deleted_at is null
    and p.approval_state = 'approved'
    and p.merged_into_id is null
    and (_board is null or p.board_id = _board)
    and (_statuses is null or cardinality(_statuses) = 0 or p.status_id = any (_statuses))
    and (
      coalesce(trim(_q), '') = ''
      or p.search @@ websearch_to_tsquery('english', _q)
      or extensions.similarity(p.title, _q) > 0.25
    )
  order by
    p.pinned desc,
    case when _sort = 'new' then extract(epoch from p.created_at) end desc nulls last,
    case when _sort = 'top' then p.vote_count end desc nulls last,
    case when _sort not in ('new', 'top') then
      p.trend_score * exp(-ln(2) * extract(epoch from (now() - p.trend_at)) / (7 * 24 * 3600))
    end desc nulls last,
    p.vote_count desc,
    p.created_at desc
  limit least(greatest(coalesce(_limit, 20), 1), 100)
  offset greatest(coalesce(_offset, 0), 0);
$$;

-- Public profile fields (name, avatar, staff badge) for people shown on the
-- portal: authors of readable posts/comments, status changers, and voters
-- on readable boards that show voters. Definer (profiles are read-own).
create or replace function public.mod_feedback_people(_ids uuid[])
returns table (id uuid, display_name text, avatar_url text, is_staff boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.display_name, pr.avatar_url, pr.is_staff
  from public.profiles pr
  where pr.id = any (_ids)
    and (
      pr.id = (select auth.uid())
      or (select public.mod_feedback_is_staff())
      or exists (
        select 1 from public.mod_feedback_posts p
        where p.author_id = pr.id
          and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
      )
      or exists (
        select 1 from public.mod_feedback_comments c
        join public.mod_feedback_posts p on p.id = c.post_id
        where c.author_id = pr.id and not c.is_internal
          and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
      )
      or exists (
        select 1 from public.mod_feedback_status_changes sc
        join public.mod_feedback_posts p on p.id = sc.post_id
        where sc.changed_by = pr.id
          and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
      )
      or exists (
        select 1 from public.mod_feedback_votes v
        join public.mod_feedback_posts p on p.id = v.post_id
        join public.mod_feedback_boards b on b.id = p.board_id
        where v.user_id = pr.id and b.show_voters
          and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
      )
    );
$$;

-- Voters of a post (when the board shows voters, or for staff).
create or replace function public.mod_feedback_post_voters(_post uuid, _limit integer default 15)
returns table (user_id uuid, display_name text, avatar_url text, priority text, total bigint)
language sql
stable
security definer
set search_path = ''
as $$
  with allowed as (
    select 1
    from public.mod_feedback_posts p
    join public.mod_feedback_boards b on b.id = p.board_id
    where p.id = _post
      and p.deleted_at is null
      and p.board_id = any (array(select public.mod_feedback_readable_board_ids()))
      and (b.show_voters or (select public.mod_feedback_is_staff()))
  ),
  v as (
    select v.user_id, v.priority, v.created_at
    from public.mod_feedback_votes v
    where v.post_id = _post and exists (select 1 from allowed)
  )
  select v.user_id, pr.display_name, pr.avatar_url,
         -- Priorities are for staff (and your own vote).
         case
           when (select public.mod_feedback_is_staff()) or v.user_id = (select auth.uid())
           then v.priority
         end,
         (select count(*) from v)
  from v
  join public.profiles pr on pr.id = v.user_id
  order by v.created_at desc
  limit least(greatest(coalesce(_limit, 15), 1), 500);
$$;

-- Reaction counts (+ whether the caller reacted) for a set of targets.
create or replace function public.mod_feedback_reaction_counts(_ids uuid[])
returns table (target_id uuid, likes bigint, mine boolean)
language sql
stable
set search_path = ''
as $$
  select r.target_id, count(*), bool_or(r.user_id = (select auth.uid()))
  from public.mod_feedback_reactions r
  where r.target_id = any (_ids)
  group by r.target_id;
$$;

-- ---------------------------------------------------------------------------
-- Staff actions (definer, staff-checked)
-- ---------------------------------------------------------------------------

create or replace function public.mod_feedback_require_staff()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.mod_feedback_is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
end;
$$;

-- Change a post's status, recording the history row. Returns the change id
-- (null when the status was already set: nothing happens, as in Canny).
create or replace function public.mod_feedback_set_status(
  _post uuid,
  _status text,
  _message text default null,
  _notify boolean default true,
  _origin text default 'user',
  _actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _old text;
  _id uuid;
begin
  perform public.mod_feedback_require_staff();
  select status_id into _old from public.mod_feedback_posts where id = _post for update;
  if not found then
    raise exception 'Unknown post' using errcode = '23503';
  end if;
  if _old is not distinct from _status then
    return null;
  end if;
  update public.mod_feedback_posts set status_id = _status where id = _post;
  insert into public.mod_feedback_status_changes
    (post_id, from_status_id, to_status_id, changed_by, origin, message, notified)
  values
    (_post, _old, _status, coalesce(_actor, (select auth.uid())), _origin,
     nullif(trim(coalesce(_message, '')), ''), _notify)
  returning id into _id;
  return _id;
end;
$$;

-- Merge `_source` into `_target`: the source is hidden (merged_into_id), its
-- voters are added to the target (tagged merged_from so unmerge can remove
-- them), and the merge is logged with an undo payload. No notifications.
create or replace function public.mod_feedback_merge_posts(_source uuid, _target uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _activity uuid;
  _added integer;
begin
  perform public.mod_feedback_require_staff();
  if _source = _target then
    raise exception 'Cannot merge a post into itself' using errcode = '22023';
  end if;
  if exists (select 1 from public.mod_feedback_posts where id = _target and merged_into_id is not null) then
    raise exception 'The target post was itself merged' using errcode = '22023';
  end if;
  update public.mod_feedback_posts set merged_into_id = _target
  where id = _source and merged_into_id is null;
  if not found then
    raise exception 'Source post not found or already merged' using errcode = '22023';
  end if;
  insert into public.mod_feedback_votes (post_id, user_id, priority, created_by, merged_from)
  select _target, v.user_id, v.priority, v.created_by, _source
  from public.mod_feedback_votes v
  where v.post_id = _source
  on conflict (post_id, user_id) do nothing;
  get diagnostics _added = row_count;
  insert into public.mod_feedback_activity (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'merge', 'post', _source::text,
          jsonb_build_object('source', _source, 'target', _target, 'votes_added', _added))
  returning id into _activity;
  return _activity;
end;
$$;

create or replace function public.mod_feedback_unmerge_post(_source uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  _target uuid;
begin
  perform public.mod_feedback_require_staff();
  select merged_into_id into _target from public.mod_feedback_posts where id = _source;
  if _target is null then
    raise exception 'Post is not merged' using errcode = '22023';
  end if;
  delete from public.mod_feedback_votes where post_id = _target and merged_from = _source;
  update public.mod_feedback_posts set merged_into_id = null where id = _source;
  update public.mod_feedback_activity set undone_at = now()
  where action = 'merge' and target_type = 'post' and target_id = _source::text and undone_at is null;
  insert into public.mod_feedback_activity (actor_id, action, target_type, target_id, data)
  values ((select auth.uid()), 'unmerge', 'post', _source::text,
          jsonb_build_object('source', _source, 'target', _target));
end;
$$;


-- ---------------------------------------------------------------------------
-- Anonymous-user data (kit_register_anon_data)
-- ---------------------------------------------------------------------------

-- Callable only by the kit's housekeeping (no client JWT): clients get false.
create or replace function public.mod_feedback_anon_has_data(_user uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    return false;
  end if;
  return exists (select 1 from public.mod_feedback_votes where user_id = _user)
      or exists (select 1 from public.mod_feedback_posts where author_id = _user)
      or exists (select 1 from public.mod_feedback_comments where author_id = _user);
end;
$$;

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
  -- Votes: keep the account's own vote when both voted.
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
end;
$$;


select public.kit_register_anon_data(
  'feedback',
  'public.mod_feedback_merge_anon',
  'public.mod_feedback_anon_has_data'
);

-- ---------------------------------------------------------------------------
-- Notification categories (modules/notifications/README.md → Producer contract)
-- ---------------------------------------------------------------------------

select public.mod_notifications_register_category(
  'feedback.post.status_changed', 'feedback', 'Feedback status updates',
  'A post you voted on, wrote or follow changed status.', 'client');
select public.mod_notifications_register_category(
  'feedback.post.comment', 'feedback', 'Feedback replies',
  'Staff replied on a post you follow, or someone replied to your comment.', 'client');
select public.mod_notifications_register_category(
  'feedback.post.created', 'feedback', 'New feedback',
  'A new post was submitted (staff).', 'staff');
select public.mod_notifications_register_category(
  'feedback.post.milestone', 'feedback', 'Vote milestones',
  'A post reached a vote milestone (staff).', 'staff');
select public.mod_notifications_register_category(
  'feedback.post.assigned', 'feedback', 'Assigned feedback',
  'A post was assigned to you (staff).', 'staff');

-- Hourly safety net for the Payload → Supabase config copy (the save hooks
-- do it immediately; this repairs any copy a failed hook missed).
select public.kit_register_app_schedule(
  'mod-feedback-config-sync',
  '23 * * * *',
  '/api/mod/feedback/cron/config-sync'
);
