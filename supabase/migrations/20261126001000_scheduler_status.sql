-- Scheduler health for "Finish connecting your services" (/cms-setup/services,
-- /api/health/setup). Background work runs on Supabase Cron and needs no
-- CRON_SECRET: the runtime bootstrap stores the app URL + a derived cron
-- secret in Vault. What can still go wrong is the app not having booted
-- against this database yet, or Supabase not reaching the app — this reports
-- both. Service role only.
--
-- Append-only + idempotent-friendly.

create or replace function public.kit_scheduler_status()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'jobs', (select count(*) from cron.job j where j.active),
    'app_url', exists (select 1 from vault.decrypted_secrets s where s.name = 'kit_app_url'),
    'cron_secret', exists (select 1 from vault.decrypted_secrets s where s.name = 'kit_cron_secret'),
    -- pg_net keeps responses for ~6 hours: recent enough to judge reachability.
    'last_ok_at', (
      select max(r.created) from net._http_response r
      where r.status_code between 200 and 299
    ),
    'last_failure_at', (
      select max(r.created) from net._http_response r
      where r.status_code is null or r.status_code >= 400
    ),
    'last_failure', (
      select coalesce(r.error_msg, 'HTTP ' || r.status_code::text)
      from net._http_response r
      where r.status_code is null or r.status_code >= 400
      order by r.created desc
      limit 1
    )
  );
$$;

revoke execute on function public.kit_scheduler_status() from public, anon, authenticated;
grant execute on function public.kit_scheduler_status() to service_role;
