-- A real, read-only SQL execution for the external availability probe.
-- Not an anonymous keepalive endpoint and never SECURITY DEFINER.
begin;

create or replace function public.infrastructure_healthcheck()
returns integer
language sql
stable
security invoker
set search_path = ''
as $$ select 1; $$;

revoke all on function public.infrastructure_healthcheck() from public, anon, authenticated;
grant execute on function public.infrastructure_healthcheck() to service_role;
comment on function public.infrastructure_healthcheck() is
  'Read-only SELECT 1 availability probe. Service role only; contains no business data.';

notify pgrst, 'reload schema';
commit;
