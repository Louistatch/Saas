-- Invoker functions preserve the caller's RLS; no service-role client is needed.
create or replace function public.get_cooperative_branch(p_root uuid)
returns uuid[] language sql stable security invoker set search_path = '' as $$
  with recursive branch(id,path) as (
    select c.id,array[c.id] from public.cooperatives c where c.id=p_root and c.deleted_at is null
    union all
    select c.id,b.path||c.id from branch b join public.cooperatives c on c.parent_id=b.id
      where c.deleted_at is null and not c.id=any(b.path)
  ) select coalesce(array_agg(id order by id),array[]::uuid[]) from branch
$$;
revoke all on function public.get_cooperative_branch(uuid) from public,anon;
grant execute on function public.get_cooperative_branch(uuid) to authenticated,service_role;

-- Count current culture/location pairs without calculating price history.
create or replace function public.get_market_location_counts(p_scope text default 'region', p_region_id uuid default null, p_prefecture_id uuid default null)
returns table(scope_id uuid, price_count bigint)
language sql stable security invoker set search_path = '' as $$
  select s.scope_id, count(distinct p.culture_id)
  from public.market_prices p
  join public.cultures c on c.id=p.culture_id
  join public.regions r on r.id=p.region_id
  cross join lateral (values ('region',p.region_id),('prefecture',p.prefecture_id),('canton',p.canton_id)) s(scope,scope_id)
  where p.price>0 and coalesce(p.data_kind,'observation')='observation'
    and s.scope=p_scope and s.scope_id is not null
    and (p_region_id is null or p.region_id=p_region_id)
    and (p_prefecture_id is null or p.prefecture_id=p_prefecture_id)
  group by s.scope_id
$$;
revoke all on function public.get_market_location_counts(text,uuid,uuid) from public;
grant execute on function public.get_market_location_counts(text,uuid,uuid) to anon,authenticated,service_role;

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
    left join public.members m on m.cooperative_id=b.node_id and m.deleted_at is null
    group by b.child_id
$$;
revoke all on function public.get_member_cooperative_counts(uuid) from public,anon;
grant execute on function public.get_member_cooperative_counts(uuid) to authenticated,service_role;

create or replace function public.get_map_statistics(p_metric text default 'members', p_cooperative_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $$
  with visible as (
    select m.prefecture,null::numeric as surface,null::text as culture
    from public.members m where p_metric='members' and m.prefecture is not null and m.deleted_at is null
      and (p_cooperative_id is null or m.cooperative_id=p_cooperative_id)
    union all
    select m.prefecture,p.surface_ha::numeric,p.culture_name::text
    from public.parcelles p join public.members m on m.id=p.member_id
    where p_metric in ('parcelles','surface_ha') and m.prefecture is not null and m.deleted_at is null
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

-- Same matched-market/weekly-chain estimator as market_price_scoped (20261003).
-- Early scope filters avoid calculating all three location levels for every request.
-- A JSON aggregate is not subject to the PostgREST default 1000-row result cap.
create or replace function public.get_market_prices(p_scope text default 'region', p_scope_id uuid default null, p_region_id uuid default null, p_culture_id uuid default null)
returns jsonb language sql stable security invoker set search_path = '' as $prices$
select coalesce(jsonb_agg(to_jsonb(result) order by age_days,culture_id,scope_id),'[]'::jsonb)
from (
with obs as (
  select distinct on (p_1.culture_id, p_1.market_name, (coalesce(p_1.observed_at, p_1.created_at)::date), p_1.price, (coalesce(p_1.price_type, 'unknown')))
    p_1.culture_id, p_1.region_id, p_1.prefecture_id, p_1.canton_id, p_1.market_name,
    coalesce(p_1.observed_at, p_1.created_at)::date as obs_day,
    p_1.price::numeric as price, p_1.source
  from public.market_prices p_1
  where (p_culture_id is null or p_1.culture_id=p_culture_id) and p_1.price > 0 and p_1.region_id is not null and coalesce(p_1.data_kind, 'observation') = 'observation'
  order by p_1.culture_id, p_1.market_name, (coalesce(p_1.observed_at, p_1.created_at)::date), p_1.price, (coalesce(p_1.price_type, 'unknown')), p_1.created_at
), scoped as (
  select o.culture_id, s_1.scope, s_1.scope_id, o.region_id, o.market_name, o.obs_day, o.price, o.source
  from obs o
  cross join lateral (values ('region', o.region_id), ('prefecture', o.prefecture_id), ('canton', o.canton_id)) s_1(scope, scope_id)
  where (p_region_id is null or o.region_id=p_region_id) and s_1.scope_id is not null and s_1.scope=p_scope and (p_scope_id is null or s_1.scope_id=p_scope_id)
), anchor as (
  select culture_id, scope, scope_id, max(obs_day) as anchor_day
  from scoped group by culture_id, scope, scope_id
), cur_m as (
  select o.culture_id, o.scope, o.scope_id, o.market_name, count(*) as n,
    percentile_cont(0.5) within group (order by o.price::double precision) as med,
    min(o.price) as pmin, max(o.price) as pmax,
    array_agg(distinct o.source) as srcs, max(o.region_id::text)::uuid as region_id
  from scoped o join anchor a_1 using (culture_id, scope, scope_id)
  where o.obs_day > a_1.anchor_day - 21
  group by o.culture_id, o.scope, o.scope_id, o.market_name
), cur as (
  select culture_id, scope, scope_id, sum(n)::bigint as n_obs, count(*) as n_markets,
    percentile_cont(0.5) within group (order by med) as median_price,
    min(pmin) as price_min, max(pmax) as price_max,
    array_agg(market_name order by market_name) as markets,
    max(region_id::text)::uuid as region_id
  from cur_m group by culture_id, scope, scope_id
), srcs as (
  select cur_m.culture_id, cur_m.scope, cur_m.scope_id, array_agg(distinct s_1.s order by s_1.s) as sources
  from cur_m, lateral unnest(cur_m.srcs) s_1(s)
  group by cur_m.culture_id, cur_m.scope, cur_m.scope_id
), prev_m as (
  select o.culture_id, o.scope, o.scope_id, o.market_name,
    percentile_cont(0.5) within group (order by o.price::double precision) as med
  from scoped o join anchor a_1 using (culture_id, scope, scope_id)
  where o.obs_day <= a_1.anchor_day - 21 and o.obs_day > a_1.anchor_day - 63
  group by o.culture_id, o.scope, o.scope_id, o.market_name
), chg as (
  -- Marchés appariés : chaque marché comparé à lui-même.
  select c.culture_id, c.scope, c.scope_id,
    percentile_cont(0.5) within group (order by ln(c.med / p.med)) as dlog
  from cur_m c join prev_m p using (culture_id, scope, scope_id, market_name)
  where c.med > 0 and p.med > 0
  group by c.culture_id, c.scope, c.scope_id
), weekly_m as (
  select o.culture_id, o.scope, o.scope_id, o.market_name,
    date_trunc('week', o.obs_day::timestamp) as wk,
    percentile_cont(0.5) within group (order by o.price::double precision) as med
  from scoped o join anchor a_1 using (culture_id, scope, scope_id)
  where o.obs_day > a_1.anchor_day - 70
  group by o.culture_id, o.scope, o.scope_id, o.market_name, date_trunc('week', o.obs_day::timestamp)
), weekly_pairs as (
  select culture_id, scope, scope_id, market_name, wk, med,
    lag(med) over w as prev_med, lag(wk) over w as prev_wk
  from weekly_m
  window w as (partition by culture_id, scope, scope_id, market_name order by wk)
), weeks as (
  select culture_id, scope, scope_id, wk,
    coalesce(percentile_cont(0.5) within group (order by ln(med / prev_med))
      filter (where prev_med > 0 and wk - prev_wk <= interval '42 days'), 0) as dlog
  from weekly_pairs
  group by culture_id, scope, scope_id, wk
), chained as (
  select culture_id, scope, scope_id, wk,
    sum(dlog) over (partition by culture_id, scope, scope_id order by wk) as cum
  from weeks
), chained2 as (
  select culture_id, scope, scope_id, wk, cum,
    max(cum) filter (where wk = max_wk) over (partition by culture_id, scope, scope_id) as cum_last
  from (select *, max(wk) over (partition by culture_id, scope, scope_id) as max_wk from chained) z
), hist as (
  select h.culture_id, h.scope, h.scope_id,
    array_agg(round(c.median_price * exp(h.cum - h.cum_last))::integer order by h.wk) as history
  from chained2 h join cur c using (culture_id, scope, scope_id)
  group by h.culture_id, h.scope, h.scope_id
)
select c.culture_id, cu.name as culture_name, c.scope, c.scope_id,
  case c.scope when 'region' then r0.name when 'prefecture' then pf.name else ct.name end as scope_name,
  c.region_id, r.name as region_name,
  round(c.median_price)::integer as price,
  round(c.price_min)::integer as price_min,
  round(c.price_max)::integer as price_max,
  c.n_obs, c.n_markets, c.markets, s.sources,
  a.anchor_day as last_observed,
  current_date - a.anchor_day as age_days,
  case when g.dlog is not null then round(c.median_price / exp(g.dlog))::integer end as previous_price,
  case when g.dlog is not null then round(((exp(g.dlog) - 1) * 100)::numeric, 1) end as change_pct,
  case
    when g.dlog is null then 'stable'
    when exp(g.dlog) - 1 >= 0.03 then 'up'
    when exp(g.dlog) - 1 <= -0.03 then 'down'
    else 'stable'
  end as trend,
  g.dlog is not null as trend_known,
  h.history
from cur c
join anchor a using (culture_id, scope, scope_id)
join srcs s using (culture_id, scope, scope_id)
join public.cultures cu on cu.id = c.culture_id
join public.regions r on r.id = c.region_id
left join public.regions r0 on c.scope = 'region' and r0.id = c.scope_id
left join public.prefectures pf on c.scope = 'prefecture' and pf.id = c.scope_id
left join public.cantons ct on c.scope = 'canton' and ct.id = c.scope_id
left join chg g using (culture_id, scope, scope_id)
left join hist h using (culture_id, scope, scope_id)
) result
$prices$;
revoke all on function public.get_market_prices(text,uuid,uuid,uuid) from public;
grant execute on function public.get_market_prices(text,uuid,uuid,uuid) to anon,authenticated,service_role;
