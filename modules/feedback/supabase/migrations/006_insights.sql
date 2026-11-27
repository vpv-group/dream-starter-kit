-- Feedback module · Insights (staff).
--
-- One call returns everything the Insights tab, the staff digest and the MCP
-- `feedback_insights` tool show: totals for the period vs the one before,
-- a time series, the current status breakdown, top requests by votes gained,
-- breakdowns by board and source, time to first response and changelog
-- readers. Security invoker: it runs under the caller's RLS (staff read
-- everything) after an explicit staff check; the service role may call it
-- for the digest cron.

create index if not exists mod_feedback_votes_created_idx
  on public.mod_feedback_votes (created_at);
create index if not exists mod_feedback_comments_created_idx
  on public.mod_feedback_comments (created_at);
create index if not exists mod_feedback_status_changes_created_idx
  on public.mod_feedback_status_changes (created_at);
create index if not exists mod_feedback_posts_created_idx
  on public.mod_feedback_posts (created_at);

-- Readers are own-row under RLS; staff get the count only.
create or replace function public.mod_feedback_changelog_reader_count(_since timestamptz)
returns bigint
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'anon' then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  perform public.mod_feedback_require_staff();
  return (
    select count(*) from public.mod_feedback_changelog_reads r
    where r.last_seen_at >= _since
  );
end;
$$;

create or replace function public.mod_feedback_insights(
  _since timestamptz,
  _board text default null
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  _now timestamptz := now();
  _since_c timestamptz := greatest(coalesce(_since, now() - interval '30 days'), now() - interval '2 years');
  _prev timestamptz;
  _unit text;
  _result jsonb;
begin
  perform public.mod_feedback_require_staff();
  _prev := _since_c - (_now - _since_c);
  _unit := case when _now - _since_c <= interval '31 days' then 'day' else 'week' end;

  with posts as (
    select p.* from public.mod_feedback_posts p
    where p.deleted_at is null
      and p.merged_into_id is null
      and (_board is null or p.board_id = _board)
  ),
  votes as (
    select v.post_id, v.user_id, v.created_at
    from public.mod_feedback_votes v
    join posts p on p.id = v.post_id
    where v.merged_from is null and v.created_at >= _prev
  ),
  comments as (
    select c.post_id, c.created_at
    from public.mod_feedback_comments c
    join posts p on p.id = c.post_id
    where c.deleted_at is null and not c.is_internal and c.created_at >= _prev
  ),
  shipped as (
    select sc.post_id, sc.created_at
    from public.mod_feedback_status_changes sc
    join posts p on p.id = sc.post_id
    join public.mod_feedback_statuses s on s.id = sc.to_status_id
    where s.type = 'complete' and sc.created_at >= _prev
  ),
  buckets as (
    select generate_series(
      date_trunc(_unit, _since_c), date_trunc(_unit, _now),
      ('1 ' || _unit)::interval
    ) as bucket
  ),
  gained as (
    select v.post_id, count(*) as n
    from votes v where v.created_at >= _since_c
    group by v.post_id
  ),
  first_response as (
    select p.id,
      extract(epoch from (min(sc.created_at) - p.created_at)) / 86400.0 as days
    from posts p
    join public.mod_feedback_status_changes sc on sc.post_id = p.id
    where p.created_at >= _since_c
    group by p.id, p.created_at
  )
  select jsonb_build_object(
    'since', _since_c,
    'unit', _unit,
    'totals', jsonb_build_object(
      'posts', jsonb_build_object(
        'current', (select count(*) from posts where created_at >= _since_c),
        'previous', (select count(*) from posts where created_at >= _prev and created_at < _since_c)),
      'votes', jsonb_build_object(
        'current', (select count(*) from votes where created_at >= _since_c),
        'previous', (select count(*) from votes where created_at < _since_c)),
      'comments', jsonb_build_object(
        'current', (select count(*) from comments where created_at >= _since_c),
        'previous', (select count(*) from comments where created_at < _since_c)),
      'voters', jsonb_build_object(
        'current', (select count(distinct user_id) from votes where created_at >= _since_c),
        'previous', (select count(distinct user_id) from votes where created_at < _since_c)),
      'shipped', jsonb_build_object(
        'current', (select count(distinct post_id) from shipped where created_at >= _since_c),
        'previous', (select count(distinct post_id) from shipped where created_at < _since_c))
    ),
    'series', coalesce((
      select jsonb_agg(jsonb_build_object(
        'bucket', b.bucket,
        'posts', (select count(*) from posts p where date_trunc(_unit, p.created_at) = b.bucket and p.created_at >= _since_c),
        'votes', (select count(*) from votes v where date_trunc(_unit, v.created_at) = b.bucket and v.created_at >= _since_c),
        'comments', (select count(*) from comments c where date_trunc(_unit, c.created_at) = b.bucket and c.created_at >= _since_c)
      ) order by b.bucket)
      from buckets b
    ), '[]'::jsonb),
    'byStatus', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'type', s.type, 'tone', s.tone, 'count', x.n
      ) order by s.position)
      from (select status_id, count(*) as n from posts group by status_id) x
      join public.mod_feedback_statuses s on s.id = x.status_id
    ), '[]'::jsonb),
    'topPosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'title', p.title, 'slug', p.slug, 'boardId', p.board_id,
        'boardSlug', bo.slug, 'statusId', p.status_id,
        'gained', g.n, 'votes', p.vote_count
      ) order by g.n desc, p.vote_count desc)
      from (select * from gained order by n desc limit 10) g
      join posts p on p.id = g.post_id
      join public.mod_feedback_boards bo on bo.id = p.board_id
    ), '[]'::jsonb),
    'byBoard', coalesce((
      select jsonb_agg(jsonb_build_object('id', bo.id, 'name', bo.name, 'count', x.n) order by x.n desc)
      from (select board_id, count(*) as n from posts where created_at >= _since_c group by board_id) x
      join public.mod_feedback_boards bo on bo.id = x.board_id
    ), '[]'::jsonb),
    'bySource', coalesce((
      select jsonb_agg(jsonb_build_object('source', x.source, 'count', x.n) order by x.n desc)
      from (select source, count(*) as n from posts where created_at >= _since_c group by source) x
    ), '[]'::jsonb),
    'medianDaysToFirstResponse', (
      select round((percentile_cont(0.5) within group (order by days))::numeric, 1)
      from first_response
    ),
    'changelogReaders', public.mod_feedback_changelog_reader_count(_since_c)
  ) into _result;
  return _result;
end;
$$;
