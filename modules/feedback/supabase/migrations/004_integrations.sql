-- Feedback module · issue-tracker integrations (GitHub built in; Jira,
-- Linear, Asana… as adapter modules).
--
-- An idea links to at most one issue per provider. Two-way status sync:
--   inbound  — the cron polls each provider for changed issues and maps the
--              issue's state onto an idea stage (Settings → Integrations →
--              status mapping), which cascades to the idea's posts;
--   outbound — moving an idea's stage enqueues mod_feedback_sync_outbox rows
--              (trigger below) that the provider worker applies to the issue.
-- Loop guard: a stage change that CAME from a provider never enqueues an
-- outbound sync back to that provider (mod_feedback.origin), and both
-- directions are no-ops when nothing differs.

create table if not exists public.mod_feedback_integrations (
  provider text primary key check (provider ~ '^[a-z][a-z0-9-]{1,40}$'),
  label text not null,
  -- Where the provider's standard routes are served (createIssueTrackerRoutes).
  route_base text not null,
  capabilities jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  cursor text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
alter table public.mod_feedback_integrations enable row level security;

drop policy if exists "mod_feedback_integrations: staff read" on public.mod_feedback_integrations;
create policy "mod_feedback_integrations: staff read"
  on public.mod_feedback_integrations for select to authenticated
  using ((select public.mod_feedback_is_staff()));

insert into public.mod_feedback_integrations (provider, label, route_base, capabilities)
values (
  'github', 'GitHub', '/api/mod/feedback/integrations/github',
  '{"search": true, "create": true, "outbound": true, "poll": true, "webhook": false}'::jsonb
)
on conflict (provider) do nothing;

create table if not exists public.mod_feedback_issue_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references public.mod_feedback_ideas (id) on delete cascade,
  provider text not null references public.mod_feedback_integrations (provider) on delete cascade,
  external_id text not null,
  key text not null,
  url text not null,
  title text not null default '',
  -- backlog | unstarted | started | completed | canceled
  state_category text not null default 'unstarted'
    check (state_category in ('backlog', 'unstarted', 'started', 'completed', 'canceled')),
  state_raw text not null default '',
  labels text[] not null default '{}',
  backlink_comment_id text,
  sync_enabled boolean not null default true,
  linked_by uuid references public.profiles (id) on delete set null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  unique (idea_id, provider),
  unique (provider, external_id)
);
create index if not exists mod_feedback_issue_links_linked_by_idx
  on public.mod_feedback_issue_links (linked_by);
alter table public.mod_feedback_issue_links enable row level security;

drop policy if exists "mod_feedback_issue_links: staff" on public.mod_feedback_issue_links;
create policy "mod_feedback_issue_links: staff"
  on public.mod_feedback_issue_links for all to authenticated
  using ((select public.mod_feedback_is_staff()))
  with check ((select public.mod_feedback_is_staff()));

create table if not exists public.mod_feedback_sync_outbox (
  id bigint generated always as identity primary key,
  link_id uuid not null references public.mod_feedback_issue_links (id) on delete cascade,
  provider text not null,
  desired_stage text not null,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists mod_feedback_sync_outbox_pending_idx
  on public.mod_feedback_sync_outbox (provider, next_attempt_at)
  where done_at is null;
create index if not exists mod_feedback_sync_outbox_link_idx
  on public.mod_feedback_sync_outbox (link_id);
alter table public.mod_feedback_sync_outbox enable row level security;

drop policy if exists "mod_feedback_sync_outbox: staff read" on public.mod_feedback_sync_outbox;
create policy "mod_feedback_sync_outbox: staff read"
  on public.mod_feedback_sync_outbox for select to authenticated
  using ((select public.mod_feedback_is_staff()));

-- Record where a stage move came from, for the outbox trigger.
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

  perform set_config('mod_feedback.origin', coalesce(_origin, 'user'), true);
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

-- Moving an idea enqueues outbound syncs for its linked issues — except to
-- the provider the move came from (loop guard).
create or replace function public.mod_feedback_ideas_enqueue_sync()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  _origin text := coalesce(current_setting('mod_feedback.origin', true), 'user');
begin
  if new.stage_id is null or new.stage_id is not distinct from old.stage_id then
    return new;
  end if;
  insert into public.mod_feedback_sync_outbox (link_id, provider, desired_stage)
  select l.id, l.provider, new.stage_id
  from public.mod_feedback_issue_links l
  join public.mod_feedback_integrations i on i.provider = l.provider
  where l.idea_id = new.id
    and l.sync_enabled
    and i.enabled
    and _origin <> 'provider:' || l.provider;
  return new;
end;
$$;

drop trigger if exists mod_feedback_ideas_enqueue_sync on public.mod_feedback_ideas;
create trigger mod_feedback_ideas_enqueue_sync
  after update of stage_id on public.mod_feedback_ideas
  for each row execute function public.mod_feedback_ideas_enqueue_sync();

-- Adapter modules (feedback-adapter-<tool>) register from their migrations
-- and unregister in their drop.sql.
create or replace function public.mod_feedback_register_provider(
  _provider text,
  _label text,
  _route_base text,
  _capabilities jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_feedback_register_provider: not allowed' using errcode = '42501';
  end if;
  insert into public.mod_feedback_integrations (provider, label, route_base, capabilities)
  values (_provider, _label, _route_base, coalesce(_capabilities, '{}'::jsonb))
  on conflict (provider) do update
    set label = excluded.label,
        route_base = excluded.route_base,
        capabilities = excluded.capabilities;
end;
$$;

create or replace function public.mod_feedback_unregister_provider(_provider text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'mod_feedback_unregister_provider: not allowed' using errcode = '42501';
  end if;
  delete from public.mod_feedback_integrations where provider = _provider;
end;
$$;

-- Every 2 minutes: drain outboxes and poll providers for changed issues.
select public.kit_register_app_schedule(
  'mod-feedback-integrations-sync',
  '*/2 * * * *',
  '/api/mod/feedback/cron/integrations-sync'
);
