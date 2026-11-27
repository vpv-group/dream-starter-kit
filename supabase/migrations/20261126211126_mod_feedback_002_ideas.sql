-- Feedback module · ideas (the internal roadmap, Canny's "Ideas").
--
-- An idea is the team's unit of planned work. Many feedback posts link to
-- one idea; the idea's STAGE maps to a portal post status (Settings → Ideas
-- & Roadmap), so moving an idea moves every linked post — and notifies their
-- voters when the stage says so — in ONE transaction
-- (mod_feedback_set_idea_stage). A post linked to an idea follows it: its
-- status changes only through the idea. Ideas are staff-only; the public
-- roadmap shows posts, as in Canny.

-- Stages are configured in Payload and copied here (like statuses).
create table if not exists public.mod_feedback_idea_stages (
  id text primary key,
  name text not null,
  type text not null check (type in ('open', 'active', 'complete', 'closed')),
  tone text not null default 'neutral'
    check (tone in ('neutral', 'info', 'warning', 'success', 'destructive')),
  -- The post status linked posts move to (null = leave posts alone).
  portal_status_id text references public.mod_feedback_statuses (id) on delete set null,
  notify_voters boolean not null default true,
  position integer not null default 0,
  archived boolean not null default false
);
create index if not exists mod_feedback_idea_stages_portal_idx
  on public.mod_feedback_idea_stages (portal_status_id);
alter table public.mod_feedback_idea_stages enable row level security;

drop policy if exists "mod_feedback_idea_stages: staff read" on public.mod_feedback_idea_stages;
create policy "mod_feedback_idea_stages: staff read"
  on public.mod_feedback_idea_stages for select to authenticated
  using ((select public.mod_feedback_is_staff()));

create table if not exists public.mod_feedback_ideas (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 400),
  description text not null default '' check (char_length(description) <= 20000),
  stage_id text references public.mod_feedback_idea_stages (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  eta date,
  eta_public boolean not null default false,
  -- { <factor key>: number } — manual score inputs (Settings → Ideas & Roadmap)
  factor_values jsonb not null default '{}'::jsonb,
  -- Sum of linked posts' votes (kept by trigger).
  vote_total integer not null default 0,
  -- Integrations never move a locked idea's stage.
  sync_locked boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  archived boolean not null default false,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mod_feedback_ideas_stage_idx
  on public.mod_feedback_ideas (stage_id, stage_changed_at desc);
create index if not exists mod_feedback_ideas_owner_idx on public.mod_feedback_ideas (owner_id);
create index if not exists mod_feedback_ideas_created_by_idx on public.mod_feedback_ideas (created_by);
alter table public.mod_feedback_ideas enable row level security;

drop policy if exists "mod_feedback_ideas: staff" on public.mod_feedback_ideas;
create policy "mod_feedback_ideas: staff"
  on public.mod_feedback_ideas for all to authenticated
  using ((select public.mod_feedback_is_staff()))
  with check ((select public.mod_feedback_is_staff()));

-- Stage moves only through mod_feedback_set_idea_stage (it cascades).
create or replace function public.mod_feedback_ideas_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.vote_total := 0;
    new.created_at := now();
    new.stage_changed_at := now();
    if new.stage_id is null then
      select s.id into new.stage_id
      from public.mod_feedback_idea_stages s
      where not s.archived
      order by s.position
      limit 1;
    end if;
  else
    if pg_trigger_depth() <= 1 then
      new.vote_total := old.vote_total;
      if new.stage_id is distinct from old.stage_id
         and coalesce(current_setting('mod_feedback.stage_cascade', true), '') <> 'on' then
        raise exception 'Move ideas with mod_feedback_set_idea_stage' using errcode = '42501';
      end if;
    end if;
    if new.stage_id is distinct from old.stage_id then
      new.stage_changed_at := now();
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists mod_feedback_ideas_before_write on public.mod_feedback_ideas;
create trigger mod_feedback_ideas_before_write
  before insert or update on public.mod_feedback_ideas
  for each row execute function public.mod_feedback_ideas_before_write();

-- Posts → ideas (a post links to at most one idea).
alter table public.mod_feedback_posts
  add column if not exists idea_id uuid references public.mod_feedback_ideas (id) on delete set null;
create index if not exists mod_feedback_posts_idea_idx on public.mod_feedback_posts (idea_id);

-- Keep ideas.vote_total = sum of live linked posts' votes.
create or replace function public.mod_feedback_posts_idea_votes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _ideas uuid[] := '{}';
begin
  if tg_op = 'UPDATE' and old.idea_id is not null and old.idea_id is distinct from new.idea_id then
    _ideas := _ideas || old.idea_id;
  end if;
  if new.idea_id is not null and (
    tg_op = 'INSERT'
    or old.idea_id is distinct from new.idea_id
    or old.vote_count <> new.vote_count
    or old.deleted_at is distinct from new.deleted_at
    or old.merged_into_id is distinct from new.merged_into_id
  ) then
    _ideas := _ideas || new.idea_id;
  end if;
  if cardinality(_ideas) > 0 then
    update public.mod_feedback_ideas i
    set vote_total = coalesce((
      select sum(p.vote_count)
      from public.mod_feedback_posts p
      where p.idea_id = i.id and p.deleted_at is null and p.merged_into_id is null
    ), 0)
    where i.id = any (_ideas);
  end if;
  return new;
end;
$$;

drop trigger if exists mod_feedback_posts_idea_votes on public.mod_feedback_posts;
create trigger mod_feedback_posts_idea_votes
  after insert or update on public.mod_feedback_posts
  for each row execute function public.mod_feedback_posts_idea_votes();

-- A post linked to an idea follows it: only the cascade (or the link itself)
-- changes its status.
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
  _idea uuid;
  _id uuid;
begin
  perform public.mod_feedback_require_staff();
  select status_id, idea_id into _old, _idea
  from public.mod_feedback_posts where id = _post for update;
  if not found then
    raise exception 'Unknown post' using errcode = '23503';
  end if;
  if _idea is not null and _origin = 'user' then
    raise exception 'This post follows its linked idea — change the idea''s stage instead'
      using errcode = '42501';
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

-- Move an idea to a stage and cascade the mapped status to every linked post
-- (one transaction). Returns the status changes it made, for notifications.
create or replace function public.mod_feedback_set_idea_stage(
  _idea uuid,
  _stage text,
  _message text default null,
  _notify boolean default true,
  _origin text default 'user',
  _actor uuid default null
)
returns table (change_id uuid, post_id uuid, notified boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  _stage_row public.mod_feedback_idea_stages%rowtype;
  _post record;
  _cid uuid;
  _do_notify boolean;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.mod_feedback_is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  select * into _stage_row from public.mod_feedback_idea_stages where id = _stage;
  if not found then
    raise exception 'Unknown stage' using errcode = '23503';
  end if;
  perform 1 from public.mod_feedback_ideas where id = _idea for update;
  if not found then
    raise exception 'Unknown idea' using errcode = '23503';
  end if;

  perform set_config('mod_feedback.stage_cascade', 'on', true);
  update public.mod_feedback_ideas set stage_id = _stage
  where id = _idea and stage_id is distinct from _stage;
  perform set_config('mod_feedback.stage_cascade', 'off', true);

  if _stage_row.portal_status_id is null then
    return;
  end if;
  _do_notify := _notify and _stage_row.notify_voters;
  for _post in
    select p.id from public.mod_feedback_posts p
    where p.idea_id = _idea
      and p.deleted_at is null
      and p.merged_into_id is null
      and p.status_id is distinct from _stage_row.portal_status_id
  loop
    _cid := public.mod_feedback_set_status(
      _post.id, _stage_row.portal_status_id, _message, _do_notify,
      case when _origin = 'user' then 'idea' else _origin end,
      coalesce(_actor, (select auth.uid()))
    );
    if _cid is not null then
      change_id := _cid;
      post_id := _post.id;
      notified := _do_notify;
      return next;
    end if;
  end loop;
end;
$$;

-- Link a post to an idea (or unlink with _idea = null). A linked post takes
-- the idea's mapped status right away (no notification: nothing shipped).
create or replace function public.mod_feedback_link_post(_post uuid, _idea uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  _status text;
begin
  if coalesce((select auth.role()), '') <> 'service_role'
     and not public.mod_feedback_is_staff() then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  update public.mod_feedback_posts set idea_id = _idea where id = _post;
  if not found then
    raise exception 'Unknown post' using errcode = '23503';
  end if;
  if _idea is null then
    return null;
  end if;
  select st.portal_status_id into _status
  from public.mod_feedback_ideas i
  join public.mod_feedback_idea_stages st on st.id = i.stage_id
  where i.id = _idea;
  if _status is null then
    return null;
  end if;
  return public.mod_feedback_set_status(_post, _status, null, false, 'idea', (select auth.uid()));
end;
$$;

-- Voter breakdown for scoring (staff): totals by priority and by user tag
-- (e.g. plan-name tags from billing → "paying voters").
create or replace function public.mod_feedback_idea_voter_stats(_ideas uuid[])
returns table (idea_id uuid, voters bigint, must bigint, important bigint, nice bigint, tags jsonb)
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
  return query
  with v as (
    select distinct on (p.idea_id, vt.user_id) p.idea_id, vt.user_id, vt.priority
    from public.mod_feedback_votes vt
    join public.mod_feedback_posts p on p.id = vt.post_id
    where p.idea_id = any (_ideas) and p.deleted_at is null and p.merged_into_id is null
  ),
  tagged as (
    select v.idea_id, t.name, count(*) as n
    from v
    join public.user_tags ut on ut.user_id = v.user_id
    join public.tags t on t.id = ut.tag_id
    group by v.idea_id, t.name
  )
  select v.idea_id,
         count(*),
         count(*) filter (where v.priority = 'must'),
         count(*) filter (where v.priority = 'important'),
         count(*) filter (where v.priority = 'nice'),
         coalesce((
           select jsonb_object_agg(tg.name, tg.n) from tagged tg where tg.idea_id = v.idea_id
         ), '{}'::jsonb)
  from v
  group by v.idea_id;
end;
$$;
