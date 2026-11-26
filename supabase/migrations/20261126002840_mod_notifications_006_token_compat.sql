-- Notifications 1.3.1 · keep already-installed mobile apps registering.
--
-- 004 made push tokens unique per device and dropped the (user_id, token)
-- unique key. Mobile builds already on people's phones still register with
-- `upsert(..., { onConflict: "user_id,token" })`, and Postgres rejects an ON
-- CONFLICT that names columns without a matching unique key — so those apps
-- could no longer register. Updates must keep the previous release's clients
-- working (expand/contract; tooling/mod/src/migration-safety.ts), so:
--   * the (user_id, token) key is back (token alone stays unique);
--   * a trigger moves a device's token to whoever registers it, for old and
--     new clients alike (the new app calls
--     mod_notifications_register_push_token, which does the same).
--
-- Reattach-friendly (if not exists / or replace).

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'mod_notifications_push_tokens_user_id_token_key'
  ) then
    alter table public.mod_notifications_push_tokens
      add constraint mod_notifications_push_tokens_user_id_token_key
      unique (user_id, token);
  end if;
end;
$$;

create or replace function public.mod_notifications_push_token_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- RLS would hide another user's row from the caller; this runs as owner.
  delete from public.mod_notifications_push_tokens t
  where t.token = new.token and t.user_id is distinct from new.user_id;
  return new;
end;
$$;

drop trigger if exists mod_notifications_push_token_claim
  on public.mod_notifications_push_tokens;
create trigger mod_notifications_push_token_claim
  before insert on public.mod_notifications_push_tokens
  for each row execute function public.mod_notifications_push_token_claim();
