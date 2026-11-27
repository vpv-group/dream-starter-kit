-- Embeddable module pages (manifest `area: "embed"`, mounted at /embed/<slug>).
--
-- Which outside sites may frame a module's embed pages. proxy.ts reads this
-- (anon key, cached) and answers /embed/<slug>/… with
-- `Content-Security-Policy: frame-ancestors 'self' <origins>`; no rows means
-- only the app itself may frame them. Modules write their list from their
-- own /admin settings through kit_set_embed_origins (service role only).
-- Origins are public by nature (the browser enforces them), so anyone reads.

create table if not exists public.kit_embed_origins (
  module text not null check (module ~ '^[a-z][a-z0-9-]{1,30}$'),
  origin text not null check (
    origin ~ '^https://[a-z0-9]([a-z0-9.-]*[a-z0-9])?(:[0-9]{1,5})?$'
    or origin ~ '^http://(localhost|127\.0\.0\.1)(:[0-9]{1,5})?$'
  ),
  created_at timestamptz not null default now(),
  primary key (module, origin)
);
alter table public.kit_embed_origins enable row level security;

drop policy if exists "kit_embed_origins: read" on public.kit_embed_origins;
create policy "kit_embed_origins: read"
  on public.kit_embed_origins for select to anon, authenticated
  using (true);

-- Replace a module's whole list atomically. Invalid origins raise (the
-- check constraint), so callers validate first.
create or replace function public.kit_set_embed_origins(_module text, _origins text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') in ('authenticated', 'anon') then
    raise exception 'service role only' using errcode = '42501';
  end if;
  delete from public.kit_embed_origins
  where module = _module and not (origin = any (coalesce(_origins, '{}')));
  insert into public.kit_embed_origins (module, origin)
  select _module, o from unnest(coalesce(_origins, '{}')) as o
  on conflict do nothing;
end;
$$;

revoke execute on function public.kit_set_embed_origins(text, text[]) from public, anon, authenticated;
grant execute on function public.kit_set_embed_origins(text, text[]) to service_role;
