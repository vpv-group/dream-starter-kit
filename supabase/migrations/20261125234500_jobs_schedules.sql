-- Scheduler, step 2: Payload's Jobs Queue owns the app's background work.
--
-- * One tick per minute: `/cms-api/payload-jobs/run?allQueues=true` first
--   queues every due scheduled task (notifications dispatch, site report,
--   scheduled publishing), then runs a bounded batch. The separate
--   handle-schedules call and the two per-route schedules are retired.
-- * Modules that serve their own cron route register it here with
--   kit_register_app_schedule() (and remove it in drop.sql with
--   kit_unregister_app_schedule()). Paths are limited to /api/mod/… and the
--   call carries the cron bearer secret.
--
-- Append-only + idempotent-friendly.

select cron.schedule(
  'kit-payload-jobs',
  '* * * * *',
  $$select private.call_app('/cms-api/payload-jobs/run?allQueues=true&limit=10')$$
);

do $$
begin
  if exists (select 1 from cron.job where jobname = 'kit-notifications-dispatch') then
    perform cron.unschedule('kit-notifications-dispatch');
  end if;
  if exists (select 1 from cron.job where jobname = 'kit-dream-site-report') then
    perform cron.unschedule('kit-dream-site-report');
  end if;
end;
$$;

create or replace function public.kit_register_app_schedule(
  _name text,
  _cron text,
  _path text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_register_app_schedule: not allowed' using errcode = '42501';
  end if;
  if _name !~ '^mod-[a-z0-9-]+$' then
    raise exception 'kit_register_app_schedule: name must look like mod-<slug>-<job>'
      using errcode = '22023';
  end if;
  if _path !~ '^/api/mod/[a-z0-9-]+/[A-Za-z0-9/_?=&.-]*$' then
    raise exception 'kit_register_app_schedule: path must be a module route (/api/mod/<slug>/…)'
      using errcode = '22023';
  end if;
  perform cron.schedule(_name, _cron, format('select private.call_app(%L)', _path));
end;
$$;

create or replace function public.kit_unregister_app_schedule(_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'kit_unregister_app_schedule: not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from cron.job where jobname = _name) then
    perform cron.unschedule(_name);
  end if;
end;
$$;

revoke execute on function public.kit_register_app_schedule(text, text, text) from public, anon, authenticated;
revoke execute on function public.kit_unregister_app_schedule(text) from public, anon, authenticated;
