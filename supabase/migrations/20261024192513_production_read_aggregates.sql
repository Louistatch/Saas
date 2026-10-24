-- Invoker functions preserve the caller's RLS; no service-role client is needed.
create or replace function public.get_market_region_counts()
returns table(region_id uuid, price_count bigint)
language sql stable security invoker set search_path = '' as $$
  select p.region_id, count(distinct p.culture_id)
  from public.market_prices p
  join public.cultures c on c.id=p.culture_id
  join public.regions r on r.id=p.region_id
  where p.price > 0 and coalesce(p.data_kind,'observation')='observation'
  group by p.region_id
$$;
revoke all on function public.get_market_region_counts() from public;
grant execute on function public.get_market_region_counts() to anon,authenticated,service_role;

create or replace function public.get_member_cooperative_counts(p_parent uuid)
returns table(child_id uuid, member_count bigint)
language sql stable security invoker set search_path = '' as $$
  with recursive branch(child_id,node_id,path) as (
    select c.id,c.id,array[p_parent,c.id] from public.cooperatives c
      where c.parent_id=p_parent and c.deleted_at is null
    union all
    select b.child_id,c.id,b.path||c.id from branch b
      join public.cooperatives c on c.parent_id=b.node_id
      where c.deleted_at is null and not c.id=any(b.path)
  )
  select b.child_id,count(m.id) from branch b
    left join public.members m on m.cooperative_id=b.node_id
    group by b.child_id
$$;
revoke all on function public.get_member_cooperative_counts(uuid) from public,anon;
grant execute on function public.get_member_cooperative_counts(uuid) to authenticated,service_role;

create or replace function public.get_map_statistics(p_metric text default 'members', p_cooperative_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as (
    select m.prefecture,null::numeric as surface,null::text as culture
    from public.members m where p_metric='members' and m.prefecture is not null
      and (p_cooperative_id is null or m.cooperative_id=p_cooperative_id)
    union all
    select m.prefecture,p.surface_ha::numeric,p.culture_name::text
    from public.parcelles p join public.members m on m.id=p.member_id
    where p_metric in ('parcelles','surface_ha') and m.prefecture is not null
      and (p_cooperative_id is null or p.cooperative_id=p_cooperative_id)
  ), grouped as (
    select prefecture,count(*) as count,round(coalesce(sum(surface),0),1) as surface_ha,
      coalesce(array_agg(distinct culture order by culture) filter(where culture is not null),array[]::text[]) as cultures
    from visible group by prefecture
  ), valued as (
    select *,case when p_metric='surface_ha' then surface_ha else count end as value from grouped
  )
  select jsonb_build_object('byPrefecture',coalesce(jsonb_agg(to_jsonb(valued) order by prefecture),'[]'::jsonb),
    'total',coalesce(sum(count),0),'max',coalesce(max(value),0)) from valued
$$;
revoke all on function public.get_map_statistics(text,uuid) from public,anon;
grant execute on function public.get_map_statistics(text,uuid) to authenticated,service_role;

create index if not exists members_cooperative_name_page_idx
on public.members(cooperative_id,last_name,first_name,id);
