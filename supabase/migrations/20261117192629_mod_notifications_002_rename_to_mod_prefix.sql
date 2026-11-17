-- Modules used to be called "extensions", and their tables used the
-- `ext_` prefix. Rename this module's tables to `mod_*`, then rename the
-- constraints, indexes and RLS policies on them that still carry the old
-- prefix. Renames keep data, grants, RLS and foreign keys intact. Idempotent:
-- a no-op where the rename already happened.
alter table if exists public.ext_notifications rename to mod_notifications;
alter table if exists public.ext_notifications_push_tokens rename to mod_notifications_push_tokens;

do $$
declare
  own text[] := array['mod_notifications', 'mod_notifications_push_tokens'];
  r record;
begin
  for r in
    select t.relname as tbl, c.conname as name
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = any (own) and c.conname like 'ext\_%'
  loop
    execute format('alter table %I.%I rename constraint %I to %I',
      'public', r.tbl, r.name, 'mod_' || substr(r.name, 5));
  end loop;

  for r in
    select i.relname as name
    from pg_index x
    join pg_class i on i.oid = x.indexrelid
    join pg_class t on t.oid = x.indrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = any (own) and i.relname like 'ext\_%'
  loop
    execute format('alter index %I.%I rename to %I',
      'public', r.name, 'mod_' || substr(r.name, 5));
  end loop;

  for r in
    select t.relname as tbl, p.polname as name
    from pg_policy p
    join pg_class t on t.oid = p.polrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public' and t.relname = any (own) and p.polname like 'ext\_%'
  loop
    execute format('alter policy %I on %I.%I rename to %I',
      r.name, 'public', r.tbl, 'mod_' || substr(r.name, 5));
  end loop;
end
$$;
