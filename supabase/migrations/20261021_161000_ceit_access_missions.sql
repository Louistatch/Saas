-- CE/IT access and Haroo missions; no FedaPay integration and no funds movement.
begin;
create table public.ceit_access_grants (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.ceit_versions(id),
 source text not null check(source in ('card','purchase')),
 member_id uuid references public.members(id),
 card_id uuid references public.member_cards(id),
 buyer_user_id uuid references public.profiles(id),
 purchase_reference text unique,
 provider_transaction_id text unique,
 amount integer not null,
 currency text not null default 'XOF' check(currency='XOF'),
 token_hash text not null check(token_hash ~ '^[a-f0-9]{64}$'),
 token_expires_at timestamptz not null default now()+interval '15 minutes',
 created_at timestamptz not null default now(), revoked_at timestamptz,
 check((source='card' and member_id is not null and card_id is not null and buyer_user_id is null and purchase_reference is null and provider_transaction_id is null and amount=0)
 or (source='purchase' and buyer_user_id is not null and member_id is null and card_id is null and purchase_reference is not null and provider_transaction_id is not null and amount=1500))
);
create unique index ceit_card_grant_once on public.ceit_access_grants(version_id,member_id) where source='card';
create index ceit_grants_buyer on public.ceit_access_grants(buyer_user_id,created_at desc);
-- Future FedaPay adapter: no HTTP checkout/webhook is wired here. Explicit activation required.
create function public.ceit_confirm_purchase(product uuid,version uuid,purchase uuid,buyer uuid,paid_amount integer,paid_currency text,proof_hash text,provider_reference text)
returns uuid language plpgsql security definer set search_path='' as $$ declare g public.ceit_access_grants; begin
 if not coalesce((select payment_adapter_enabled from public.ceit_financial_policy where singleton),false) then raise exception 'payment adapter disabled'; end if;
 if paid_amount is distinct from 1500 or paid_currency is distinct from 'XOF' then raise exception 'invalid paid amount or currency'; end if;
 if provider_reference is null or provider_reference !~ '^fedapay:[a-zA-Z0-9_-]{1,100}$' then raise exception 'invalid provider reference'; end if;
 -- Lock the receipt's unique identity: a retry never creates another acquisition.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ceit:'||purchase::text,0));
 select * into g from public.ceit_access_grants where purchase_reference=purchase::text for update;
 if g.id is not null then
  if g.version_id<>version or g.buyer_user_id<>buyer or g.provider_transaction_id<>provider_reference or not exists(select 1 from public.ceit_versions where id=version and product_id=product) then raise exception 'purchase mismatch'; end if;
  return g.id;
 end if;
 perform 1 from public.ceit_products d join public.ceit_versions v on v.id=d.published_version_id
 where d.id=product and v.id=version and v.state='published' and d.archived_at is null for share of d,v;
 if not found then raise exception 'not published'; end if;
 insert into public.ceit_access_grants(version_id,source,buyer_user_id,purchase_reference,provider_transaction_id,amount,currency,token_hash,token_expires_at)
 values(version,'purchase',buyer,purchase::text,provider_reference,1500,'XOF',proof_hash,now()) returning * into g;
 return g.id;
end $$;
revoke all on function public.ceit_confirm_purchase(uuid,uuid,uuid,uuid,integer,text,text,text) from public,anon,authenticated;
grant execute on function public.ceit_confirm_purchase(uuid,uuid,uuid,uuid,integer,text,text,text) to service_role;
create table public.ceit_download_events (
 id uuid primary key default gen_random_uuid(),grant_id uuid not null references public.ceit_access_grants(id),created_at timestamptz not null default now()
);
create table public.ceit_agronome_availability (
 agronome_id uuid primary key references public.haroo_agronome_profiles(id),
 available boolean not null default false,
 cultures text[] not null check(cardinality(cultures) between 1 and 30),
 skills text[] not null check(cardinality(skills) between 1 and 30),
 max_active integer not null default 1 check(max_active between 1 and 5),
 updated_at timestamptz not null default now()
);
create table public.ceit_missions (
 id uuid primary key default gen_random_uuid(),
 grant_id uuid not null references public.ceit_access_grants(id),
 agronome_id uuid not null references public.haroo_agronome_profiles(id),
 scope text not null check(length(scope) between 20 and 2000),
 status text not null default 'proposed' check(status in ('proposed','accepted','declined','completed','cancelled')),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '48 hours',
 accepted_at timestamptz, completed_at timestamptz
);
create unique index ceit_mission_open_grant on public.ceit_missions(grant_id) where status in ('proposed','accepted');
create index ceit_mission_agronome on public.ceit_missions(agronome_id,status);

-- Active card AND active member, same cooperative, finite unbroken ancestry to the owner.
create function private.ceit_card_in_tree(card uuid,member uuid,root uuid) returns boolean
language sql stable security definer set search_path='' as $$
 with recursive chain(id,parent_id,level,seen,depth) as (
   select co.id,co.parent_id,co.level::text,array[co.id],1
   from public.member_cards ca join public.members m on m.id=ca.member_id
   join public.cooperatives co on co.id=ca.cooperative_id
   where ca.id=card and m.id=member and ca.card_type::text='FAITIERE'
   and ca.status::text='active' and ca.deleted_at is null and ca.revoked_at is null and ca.suspended_at is null
   and (ca.expiry_date is null or ca.expiry_date>=current_date)
   and m.status::text='active' and m.deleted_at is null and m.cooperative_id=ca.cooperative_id and co.deleted_at is null
   union all
   select p.id,p.parent_id,p.level::text,chain.seen||p.id,chain.depth+1
   from chain join public.cooperatives p on p.id=chain.parent_id
   where chain.depth<6 and chain.id<>root and not p.id=any(chain.seen) and p.deleted_at is null
 ) select exists(select 1 from chain where id=root and level='faitiere' and parent_id is null);
$$;
create function private.ceit_grant_usable(g public.ceit_access_grants) returns boolean
language sql stable security definer set search_path='' as $$
 select g.revoked_at is null and exists(select 1 from public.ceit_versions v join public.ceit_products d on d.id=v.product_id
 where v.id=g.version_id and v.state='published' and
 (g.source='purchase' or (d.archived_at is null and d.owner_kind='faitiere' and private.ceit_card_in_tree(g.card_id,g.member_id,d.faitiere_id))));
$$;

do $$ declare t text; begin
 foreach t in array array['access_grants','download_events','agronome_availability','missions'] loop
 execute format('alter table public.ceit_%I enable row level security',t);
 execute format('revoke all on public.ceit_%I from anon,authenticated',t);
 execute format('grant all on public.ceit_%I to service_role',t);
 end loop;
end $$;
-- Never expose download token hashes through a direct authenticated SELECT.
grant select(id,version_id,source,amount,currency,created_at,revoked_at) on public.ceit_access_grants to authenticated;
create policy ceit_grants_buyer on public.ceit_access_grants for select to authenticated using(buyer_user_id=auth.uid());
grant select on public.ceit_missions,public.ceit_agronome_availability to authenticated;
create policy ceit_missions_agent on public.ceit_missions for select to authenticated using
 (exists(select 1 from public.haroo_agronome_profiles a where a.id=agronome_id and a.user_id=auth.uid()));
create policy ceit_availability_self on public.ceit_agronome_availability for select to authenticated using
 (exists(select 1 from public.haroo_agronome_profiles a where a.id=agronome_id and a.user_id=auth.uid()));

-- Server only, AFTER loginWithCardPin succeeded. A number, session cookie or account alone is insufficient.
create function public.ceit_grant_card(product uuid,card uuid,member uuid,proof_hash text)
returns uuid language plpgsql security definer set search_path='' as $$
declare d public.ceit_products; result uuid; begin
 select * into d from public.ceit_products where id=product and archived_at is null for share;
 if d.id is null or d.owner_kind<>'faitiere' or d.published_version_id is null or not private.ceit_card_in_tree(card,member,d.faitiere_id)
 then raise exception 'card access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.ceit_versions where id=d.published_version_id and state='published') then raise exception 'not published'; end if;
 insert into public.ceit_access_grants(version_id,source,member_id,card_id,amount,token_hash)
 values(d.published_version_id,'card',member,card,0,proof_hash)
 on conflict(version_id,member_id) where source='card' do update
 set card_id=excluded.card_id,token_hash=excluded.token_hash,token_expires_at=now()+interval '15 minutes',revoked_at=null
 returning id into result;
 return result;
end $$;
-- Token is supplied in a POST body, never a URL. Re-read card eligibility on every use.
create function public.ceit_check_grant(grant_uuid uuid,proof_hash text,actor uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$ declare g public.ceit_access_grants; v public.ceit_versions; begin
 select * into g from public.ceit_access_grants where id=grant_uuid;
 if g.id is null or not private.ceit_grant_usable(g) or not
 ((g.token_hash=proof_hash and g.token_expires_at>now()) or (g.source='purchase' and actor is not null and g.buyer_user_id=actor))
 then raise exception 'access denied' using errcode='42501'; end if;
 select * into v from public.ceit_versions where id=g.version_id;
 return jsonb_build_object('grant_id',g.id,'version_id',v.id,'product_id',v.product_id,'ce_key',v.ce_key,'it_key',v.it_key);
end $$;

create function public.ceit_set_availability(is_available boolean,offered_cultures text[],offered_skills text[],capacity integer default 1)
returns void language plpgsql security definer set search_path='' as $$ declare a uuid; begin
 if not private.ceit_agronome(auth.uid()) then raise exception 'unverified agronomist' using errcode='42501'; end if;
 select id into a from public.haroo_agronome_profiles where user_id=auth.uid();
 insert into public.ceit_agronome_availability(agronome_id,available,cultures,skills,max_active)
 values(a,is_available,offered_cultures,offered_skills,capacity)
 on conflict(agronome_id) do update set available=excluded.available,cultures=excluded.cultures,skills=excluded.skills,max_active=excluded.max_active,updated_at=now();
end $$;
create function private.ceit_candidate(a uuid,product uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ceit_agronome_availability av
 join public.haroo_agronome_profiles ap on ap.id=av.agronome_id
 join public.ceit_expertise e on e.agronome_id=av.agronome_id and e.revoked_at is null
 join public.ceit_products d on d.id=product
 where av.agronome_id=a and av.available and private.ceit_agronome(ap.user_id)
 and d.culture=any(av.cultures) and d.skills <@ av.skills
 and d.culture=any(e.cultures) and d.skills <@ e.skills
 and (select count(*) from public.ceit_missions m where m.agronome_id=a and m.status='accepted')<av.max_active);
$$;
create function public.ceit_candidates(grant_uuid uuid,proof_hash text,actor uuid default null)
returns table(agronome_id uuid,name text,canton_id uuid,location_rank integer)
language plpgsql security definer set search_path='' as $$ declare access jsonb; begin
 access:=public.ceit_check_grant(grant_uuid,proof_hash,actor);
 return query select a.id,concat(a.first_name,' ',left(a.last_name,1),'.'),a.canton_id,
 case when a.canton_id=d.canton_id then 0 when ca.prefecture_id=d.prefecture_id then 1 when pa.region_id=d.region_id then 2 else 3 end
 from public.haroo_agronome_profiles a join public.ceit_products d on d.id=(access->>'product_id')::uuid
 left join public.cantons ca on ca.id=a.canton_id left join public.prefectures pa on pa.id=ca.prefecture_id
 where private.ceit_candidate(a.id,d.id) order by 4,a.id limit 10;
end $$;
create function public.ceit_propose_mission(grant_uuid uuid,proof_hash text,agronome uuid,scope_text text,acknowledged boolean,actor uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare access jsonb; result uuid; begin
 access:=public.ceit_check_grant(grant_uuid,proof_hash,actor);
 if acknowledged is not true or not private.ceit_candidate(agronome,(access->>'product_id')::uuid) then raise exception 'mission unavailable'; end if;
 -- Serializes two proposals for the same access, including expired proposal cleanup.
 perform 1 from public.ceit_access_grants where id=grant_uuid for update;
 update public.ceit_missions set status='cancelled' where grant_id=grant_uuid and status='proposed' and expires_at<=now();
 insert into public.ceit_missions(grant_id,agronome_id,scope) values(grant_uuid,agronome,scope_text) returning id into result;
 return result;
end $$;
create function public.ceit_respond_mission(mission uuid,decision text)
returns void language plpgsql security definer set search_path='' as $$ declare m public.ceit_missions; a uuid; busy integer; cap integer; begin
 select id into a from public.haroo_agronome_profiles where user_id=auth.uid();
 if a is null or not private.ceit_agronome(auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
 -- Lock the agronomist before the mission: simultaneous accepts share a single capacity.
 select max_active into cap from public.ceit_agronome_availability where agronome_id=a for update;
 select * into m from public.ceit_missions where id=mission and agronome_id=a for update;
 if m.id is null then raise exception 'forbidden' using errcode='42501'; end if;
 if decision='decline' and m.status='proposed' then
   update public.ceit_missions set status='declined' where id=mission;
 elsif decision='accept' and m.status='proposed' and m.expires_at>now() then
   if not exists(select 1 from public.ceit_access_grants g where g.id=m.grant_id and private.ceit_grant_usable(g)) then raise exception 'access revoked'; end if;
   if not exists(select 1 from public.ceit_access_grants g join public.ceit_versions v on v.id=g.version_id where g.id=m.grant_id and private.ceit_candidate(a,v.product_id)) then raise exception 'not available'; end if;
   select count(*) into busy from public.ceit_missions where agronome_id=a and status='accepted';
   if cap is null or busy>=cap then raise exception 'capacity exceeded'; end if;
   update public.ceit_missions set status='accepted',accepted_at=now() where id=mission;
 elsif decision='complete' and m.status='accepted' then
   update public.ceit_missions set status='completed',completed_at=now() where id=mission;
 else raise exception 'invalid response'; end if;
end $$;

revoke all on function private.ceit_card_in_tree(uuid,uuid,uuid),private.ceit_grant_usable(public.ceit_access_grants),private.ceit_candidate(uuid,uuid) from public,anon,authenticated;
revoke all on function public.ceit_grant_card(uuid,uuid,uuid,text),public.ceit_check_grant(uuid,text,uuid),public.ceit_candidates(uuid,text,uuid),
 public.ceit_propose_mission(uuid,text,uuid,text,boolean,uuid),public.ceit_set_availability(boolean,text[],text[],integer),public.ceit_respond_mission(uuid,text) from public,anon,authenticated;
grant execute on function public.ceit_grant_card(uuid,uuid,uuid,text),public.ceit_check_grant(uuid,text,uuid),public.ceit_candidates(uuid,text,uuid),
 public.ceit_propose_mission(uuid,text,uuid,text,boolean,uuid) to service_role;
grant execute on function public.ceit_set_availability(boolean,text[],text[],integer),public.ceit_respond_mission(uuid,text) to authenticated;
commit;
