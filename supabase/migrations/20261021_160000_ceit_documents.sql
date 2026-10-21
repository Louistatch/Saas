-- Isolated CE/IT module. Additive only; no change to partners, PAYG, fiches or purchases.
-- Apply only after explicit approval. Read docs/agents/ce-it-contract.md.
begin;

create table public.ceit_operator_rights (
  partner_id uuid primary key references public.partners(id),
  approved_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table public.ceit_mandates (
  partner_id uuid not null references public.partners(id),
  faitiere_id uuid not null references public.cooperatives(id),
  approved_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  primary key(partner_id, faitiere_id)
);
create table public.ceit_reviewers (
  user_id uuid primary key references public.profiles(id),
  approved_by uuid not null references public.profiles(id),
  expires_at timestamptz not null,
  revoked_at timestamptz
);
create table public.ceit_expertise (
  agronome_id uuid primary key references public.haroo_agronome_profiles(id),
  cultures text[] not null check(cardinality(cultures) between 1 and 30),
  skills text[] not null check(cardinality(skills) between 1 and 30),
  approved_by uuid not null references public.profiles(id),
  revoked_at timestamptz
);
create table public.ceit_products (
  id uuid primary key default gen_random_uuid(),
  owner_kind text not null check(owner_kind in ('faitiere','operator','platform')),
  faitiere_id uuid references public.cooperatives(id),
  operator_id uuid references public.partners(id),
  title text not null check(length(title) between 3 and 160),
  culture text not null check(culture ~ '^[a-z0-9_-]{2,60}$'),
  skills text[] not null check(cardinality(skills) between 1 and 12),
  region_id uuid references public.regions(id),
  prefecture_id uuid references public.prefectures(id),
  canton_id uuid references public.cantons(id),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  published_version_id uuid,
  check (
    (owner_kind='faitiere' and faitiere_id is not null and operator_id is null) or
    (owner_kind='operator' and operator_id is not null and faitiere_id is null) or
    (owner_kind='platform' and faitiere_id is null and operator_id is null)
  )
);
create table public.ceit_contributors (
  product_id uuid not null references public.ceit_products(id),
  agronome_id uuid not null references public.haroo_agronome_profiles(id),
  added_by uuid not null references public.profiles(id),
  revoked_at timestamptz,
  primary key(product_id, agronome_id)
);
create table public.ceit_versions (
  id uuid primary key,
  product_id uuid not null references public.ceit_products(id),
  number integer not null check(number>0),
  state text not null default 'draft' check(state in ('draft','submitted','approved','rejected','published')),
  payload jsonb not null,
  ce_key text not null,
  it_key text not null,
  ce_sha256 text not null check(ce_sha256 ~ '^[a-f0-9]{64}$'),
  it_sha256 text not null check(it_sha256 ~ '^[a-f0-9]{64}$'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  unique(product_id,number), unique(product_id,id),
  check(ce_key=product_id::text || '/' || id::text || '/ce.pdf'),
  check(it_key=product_id::text || '/' || id::text || '/it.pdf')
);
alter table public.ceit_products add constraint ceit_product_published_version_fk
  foreign key(id,published_version_id) references public.ceit_versions(product_id,id);
create table public.ceit_reviews (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.ceit_versions(id),
  reviewer_id uuid not null references public.profiles(id),
  decision text not null check(decision in ('approved','rejected')),
  notes text not null check(length(notes) between 20 and 3000),
  created_at timestamptz not null default now(),
  unique(version_id)
);
create table public.ceit_financial_policy (
  singleton boolean primary key default true check(singleton),
  commission_bps integer check(commission_bps between 0 and 10000),
  approved_by uuid references public.profiles(id),
  approved_at timestamptz,
  payouts_enabled boolean not null default false,
  payment_adapter_enabled boolean not null default false,
  check(not payouts_enabled or (commission_bps is not null and approved_by is not null and approved_at is not null))
);
insert into public.ceit_financial_policy(singleton) values(true);
comment on table public.ceit_financial_policy is
  'Digital documents only. No 250 XOF card commission. No payout executor is included. Configuration requires separately approved financial integration.';

create index ceit_products_catalogue_idx on public.ceit_products(culture,region_id,canton_id) where archived_at is null;
create index ceit_versions_product_idx on public.ceit_versions(product_id,created_at desc);
create index ceit_contributors_agronome_idx on public.ceit_contributors(agronome_id) where revoked_at is null;

create function private.ceit_admin(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles where id=u and role::text='super_admin');
$$;
create function private.ceit_agronome(u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.haroo_agronome_profiles a
 join public.member_cards c on c.card_number=a.card_number
 where a.user_id=u and a.badge_valide and a.statut_validation='VALIDE'
 and c.card_type::text='AGRONOME' and c.status::text='active' and c.deleted_at is null
 and c.revoked_at is null and c.suspended_at is null
 and (c.expiry_date is null or c.expiry_date>=current_date));
$$;
create function private.ceit_operator(p uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ceit_operator_rights r
 join public.partners p on p.id=r.partner_id
 join public.partner_memberships m on m.partner_id=p.id
 where p.id=$1 and p.status::text='active' and m.user_id=u and m.status::text='active'
 and r.revoked_at is null and r.expires_at>now());
$$;
create function private.ceit_owner(k text,f uuid,o uuid,u uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ceit_admin(u) or
 (k='operator' and private.ceit_operator(o,u)) or
 (k='faitiere' and exists(select 1 from public.ceit_mandates m
 join public.cooperatives c on c.id=m.faitiere_id
 where m.faitiere_id=f and c.level::text='faitiere' and c.deleted_at is null
 and m.revoked_at is null and m.expires_at>now() and private.ceit_operator(m.partner_id,u)));
$$;
create function private.ceit_manage(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.ceit_products d where d.id=p and
 private.ceit_owner(d.owner_kind,d.faitiere_id,d.operator_id,u));
$$;
create function private.ceit_contribute(p uuid,u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ceit_agronome(u) and exists(select 1 from public.ceit_contributors c
 join public.haroo_agronome_profiles a on a.id=c.agronome_id
 where c.product_id=p and c.revoked_at is null and a.user_id=u);
$$;
create function private.ceit_reviewer(u uuid default auth.uid()) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ceit_agronome(u) and exists(select 1 from public.ceit_reviewers
 where user_id=u and revoked_at is null and expires_at>now());
$$;
-- Documents are immutable, even for a mistaken service UPDATE. Corrections create a new version.
create function private.ceit_immutable_version() returns trigger
language plpgsql set search_path='' as $$ begin
 if row(new.id,new.product_id,new.number,new.payload,new.ce_key,new.it_key,new.ce_sha256,new.it_sha256,new.created_by,new.created_at)
 is distinct from row(old.id,old.product_id,old.number,old.payload,old.ce_key,old.it_key,old.ce_sha256,old.it_sha256,old.created_by,old.created_at)
 then raise exception 'immutable version: create a new version'; end if;
 return new;
end $$;
revoke all on function private.ceit_immutable_version() from public,anon,authenticated;
create trigger ceit_version_immutable before update on public.ceit_versions
 for each row execute function private.ceit_immutable_version();
create function public.ceit_can_edit(product uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.ceit_manage(product) or private.ceit_contribute(product);
$$;
revoke all on function public.ceit_can_edit(uuid) from public,anon,authenticated;
grant execute on function public.ceit_can_edit(uuid) to authenticated;
create function public.ceit_workspace() returns jsonb
language plpgsql stable security definer set search_path='' as $$ declare owners jsonb; experts jsonb; begin
 if auth.uid() is null then raise exception 'forbidden' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x),'[]') into owners from (
   select 'faitiere' as kind,c.id,c.name from public.cooperatives c where c.level::text='faitiere' and c.deleted_at is null and private.ceit_owner('faitiere',c.id,null,auth.uid())
   union all select 'operator',p.id,p.display_name from public.partners p where p.status::text='active' and private.ceit_owner('operator',null,p.id,auth.uid())
   union all select 'platform',null::uuid,'FaîtièreHub' where private.ceit_admin()
 ) x;
 if private.ceit_admin() then
   select coalesce(jsonb_agg(x),'[]') into experts from (select a.id,a.user_id,concat(a.first_name,' ',a.last_name) as name from public.haroo_agronome_profiles a where private.ceit_agronome(a.user_id) order by a.id limit 500) x;
 else experts:='[]'::jsonb; end if;
 return jsonb_build_object('owners',owners,'experts',experts,'reviewer',private.ceit_reviewer(),'agronome',private.ceit_agronome(auth.uid()));
end $$;
revoke all on function public.ceit_workspace() from public,anon,authenticated;
grant execute on function public.ceit_workspace() to authenticated;

-- All writes go through bounded functions. No browser can edit ownership, review or files.
do $$ declare t text; begin
 foreach t in array array['operator_rights','mandates','reviewers','expertise','products','contributors','versions','reviews','financial_policy'] loop
 execute format('alter table public.ceit_%I enable row level security',t);
 execute format('revoke all on public.ceit_%I from anon,authenticated',t);
 execute format('grant all on public.ceit_%I to service_role',t);
 end loop;
end $$;
grant select on public.ceit_products,public.ceit_versions,public.ceit_contributors,public.ceit_reviews,
 public.ceit_operator_rights,public.ceit_mandates,public.ceit_reviewers,public.ceit_expertise,public.ceit_financial_policy to authenticated;
create policy ceit_products_staff on public.ceit_products for select to authenticated using
 (private.ceit_manage(id) or private.ceit_contribute(id) or private.ceit_reviewer());
create policy ceit_versions_staff on public.ceit_versions for select to authenticated using
 (private.ceit_manage(product_id) or private.ceit_contribute(product_id) or private.ceit_reviewer());
create policy ceit_contributors_staff on public.ceit_contributors for select to authenticated using
 (private.ceit_manage(product_id) or private.ceit_contribute(product_id) or private.ceit_reviewer());
create policy ceit_reviews_staff on public.ceit_reviews for select to authenticated using
 (exists(select 1 from public.ceit_versions v where v.id=version_id));
create policy ceit_rights_admin on public.ceit_operator_rights for select to authenticated using(private.ceit_admin());
create policy ceit_mandates_admin on public.ceit_mandates for select to authenticated using(private.ceit_admin());
create policy ceit_reviewers_admin on public.ceit_reviewers for select to authenticated using(private.ceit_admin());
create policy ceit_expertise_self on public.ceit_expertise for select to authenticated using(private.ceit_admin() or exists(select 1 from public.haroo_agronome_profiles a where a.id=agronome_id and a.user_id=auth.uid()));
create policy ceit_finance_admin on public.ceit_financial_policy for select to authenticated using(private.ceit_admin());

create function public.ceit_authorize(kind text,target uuid,until_at timestamptz,faitiere uuid default null,revoked boolean default false)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.ceit_admin() or until_at<=now() or until_at>now()+interval '2 years' then raise exception 'forbidden' using errcode='42501'; end if;
 if kind='operator' then
   insert into public.ceit_operator_rights values(target,auth.uid(),until_at,case when revoked then now() end)
   on conflict(partner_id) do update set approved_by=auth.uid(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 elsif kind='mandate' and exists(select 1 from public.cooperatives where id=faitiere and level::text='faitiere' and deleted_at is null) then
   insert into public.ceit_mandates values(target,faitiere,auth.uid(),until_at,case when revoked then now() end)
   on conflict(partner_id,faitiere_id) do update set approved_by=auth.uid(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 elsif kind='reviewer' and private.ceit_agronome(target) then
   insert into public.ceit_reviewers values(target,auth.uid(),until_at,case when revoked then now() end)
   on conflict(user_id) do update set approved_by=auth.uid(),expires_at=excluded.expires_at,revoked_at=excluded.revoked_at;
 else raise exception 'invalid authorization'; end if;
end $$;

create function public.ceit_qualify_agronome(agronome uuid,cultures text[],skills text[],revoked boolean default false)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.ceit_admin() or not exists(select 1 from public.haroo_agronome_profiles a where a.id=agronome and private.ceit_agronome(a.user_id)) then raise exception 'forbidden' using errcode='42501'; end if;
 insert into public.ceit_expertise values(agronome,cultures,skills,auth.uid(),case when revoked then now() end)
 on conflict(agronome_id) do update set cultures=excluded.cultures,skills=excluded.skills,approved_by=auth.uid(),revoked_at=excluded.revoked_at;
end $$;

create function public.ceit_create_product(k text,f uuid,o uuid,t text,c text,s text[],r uuid default null,p uuid default null,z uuid default null)
returns uuid language plpgsql security definer set search_path='' as $$ declare result uuid; begin
 if auth.uid() is null or not private.ceit_owner(k,f,o,auth.uid()) then raise exception 'forbidden' using errcode='42501'; end if;
 if z is not null and not exists(select 1 from public.cantons c join public.prefectures p on p.id=c.prefecture_id where c.id=z and (ceit_create_product.p is null or p.id=ceit_create_product.p) and (r is null or p.region_id=r)) then raise exception 'invalid location'; end if;
 if p is not null and not exists(select 1 from public.prefectures where id=p and (r is null or region_id=r)) then raise exception 'invalid location'; end if;
 if k='faitiere' and not exists(select 1 from public.cooperatives where id=f and level::text='faitiere' and deleted_at is null) then raise exception 'invalid owner'; end if;
 insert into public.ceit_products(owner_kind,faitiere_id,operator_id,title,culture,skills,region_id,prefecture_id,canton_id,created_by)
 values(k,f,o,t,c,s,r,p,z,auth.uid()) returning id into result;
 return result;
end $$;
create function public.ceit_add_contributor(product uuid,agronome uuid,revoked boolean default false)
returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.ceit_manage(product) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.haroo_agronome_profiles where id=agronome and private.ceit_agronome(user_id)) then raise exception 'unverified agronomist'; end if;
 insert into public.ceit_contributors values(product,agronome,auth.uid(),case when revoked then now() end)
 on conflict(product_id,agronome_id) do update set revoked_at=excluded.revoked_at;
end $$;

-- Service-only: the HTTP handler validates content and uploads both PDFs under immutable keys.
create function public.ceit_add_version(actor uuid,product uuid,version uuid,body jsonb,ce_hash text,it_hash text)
returns uuid language plpgsql security definer set search_path='' as $$ declare n integer; begin
 perform 1 from public.ceit_products where id=product and archived_at is null for update;
 if not found or not (private.ceit_manage(product,actor) or private.ceit_contribute(product,actor)) then raise exception 'forbidden' using errcode='42501'; end if;
 if jsonb_typeof(body)<>'object' or jsonb_array_length(coalesce(body->'sources','[]'))<1 then raise exception 'scientific sources required'; end if;
 select coalesce(max(number),0)+1 into n from public.ceit_versions where product_id=product;
 insert into public.ceit_versions(id,product_id,number,payload,ce_key,it_key,ce_sha256,it_sha256,created_by)
 values(version,product,n,body,product::text||'/'||version::text||'/ce.pdf',product::text||'/'||version::text||'/it.pdf',ce_hash,it_hash,actor);
 return version;
end $$;
create function public.ceit_transition(version uuid,action text,notes text default '')
returns void language plpgsql security definer set search_path='' as $$
declare v public.ceit_versions; d public.ceit_products; begin
 select product_id into d.id from public.ceit_versions where id=version;
 select * into d from public.ceit_products where id=d.id for update;
 select * into v from public.ceit_versions where id=version for update;
 if v.id is null or d.archived_at is not null then raise exception 'not found'; end if;
 if action='submit' and v.state='draft' and (private.ceit_manage(d.id) or private.ceit_contribute(d.id)) then
   update public.ceit_versions set state='submitted',submitted_at=now() where id=version;
 elsif action in ('approve','reject') and v.state='submitted' and private.ceit_reviewer()
   and exists(select 1 from public.ceit_expertise e join public.haroo_agronome_profiles a on a.id=e.agronome_id where a.user_id=auth.uid() and e.revoked_at is null and d.culture=any(e.cultures) and d.skills <@ e.skills)
   and auth.uid()<>v.created_by and auth.uid()<>d.created_by
   and not exists(select 1 from public.ceit_contributors c join public.haroo_agronome_profiles a on a.id=c.agronome_id where c.product_id=d.id and a.user_id=auth.uid()) then
   insert into public.ceit_reviews(version_id,reviewer_id,decision,notes) values(version,auth.uid(),case action when 'approve' then 'approved' else 'rejected' end,notes);
   update public.ceit_versions set state=case action when 'approve' then 'approved' else 'rejected' end where id=version;
 elsif action='publish' and v.state='approved' and private.ceit_manage(d.id) then
   update public.ceit_versions set state='published' where id=version;
   update public.ceit_products set published_version_id=version where id=d.id;
 else raise exception 'transition forbidden' using errcode='42501'; end if;
end $$;
create function public.ceit_archive(product uuid) returns void language plpgsql security definer set search_path='' as $$ begin
 if not private.ceit_manage(product) then raise exception 'forbidden' using errcode='42501'; end if;
 update public.ceit_products set archived_at=now() where id=product;
end $$;
create function public.ceit_catalogue(culture_filter text default null,region_filter uuid default null,canton_filter uuid default null,owner_filter text default null,prefecture_filter uuid default null)
returns table(id uuid,title text,culture text,owner_kind text,owner_name text,region_id uuid,prefecture_id uuid,canton_id uuid,version_id uuid,price integer)
language sql stable security definer set search_path='' as $$
 select d.id,d.title,d.culture,d.owner_kind,
 case d.owner_kind when 'faitiere' then c.name when 'operator' then p.display_name else 'FaîtièreHub' end,
 d.region_id,d.prefecture_id,d.canton_id,d.published_version_id,1500
 from public.ceit_products d join public.ceit_versions v on v.id=d.published_version_id and v.state='published'
 left join public.cooperatives c on c.id=d.faitiere_id left join public.partners p on p.id=d.operator_id
 where d.archived_at is null and (culture_filter is null or d.culture=culture_filter)
 and (region_filter is null or d.region_id=region_filter) and (canton_filter is null or d.canton_id=canton_filter)
 and (prefecture_filter is null or d.prefecture_id=prefecture_filter)
 and (owner_filter is null or d.owner_kind=owner_filter) order by d.created_at desc,d.id limit 100;
$$;

-- Private functions must never be executable by anon (nor with caller-supplied identities).
revoke all on function private.ceit_admin(uuid),private.ceit_agronome(uuid),private.ceit_operator(uuid,uuid),
 private.ceit_owner(text,uuid,uuid,uuid),private.ceit_manage(uuid,uuid),private.ceit_contribute(uuid,uuid),private.ceit_reviewer(uuid) from public,anon;
grant execute on function private.ceit_admin(uuid),private.ceit_manage(uuid,uuid),private.ceit_contribute(uuid,uuid),private.ceit_reviewer(uuid) to authenticated,service_role;
revoke all on function public.ceit_authorize(text,uuid,timestamptz,uuid,boolean),public.ceit_create_product(text,uuid,uuid,text,text,text[],uuid,uuid,uuid),
 public.ceit_add_contributor(uuid,uuid,boolean),public.ceit_transition(uuid,text,text),public.ceit_archive(uuid),public.ceit_catalogue(text,uuid,uuid,text,uuid),
 public.ceit_add_version(uuid,uuid,uuid,jsonb,text,text) from public,anon,authenticated;
revoke all on function public.ceit_qualify_agronome(uuid,text[],text[],boolean) from public,anon,authenticated;
grant execute on function public.ceit_qualify_agronome(uuid,text[],text[],boolean) to authenticated;
grant execute on function public.ceit_authorize(text,uuid,timestamptz,uuid,boolean),public.ceit_create_product(text,uuid,uuid,text,text,text[],uuid,uuid,uuid),
 public.ceit_add_contributor(uuid,uuid,boolean),public.ceit_transition(uuid,text,text),public.ceit_archive(uuid) to authenticated;
grant execute on function public.ceit_catalogue(text,uuid,uuid,text,uuid) to anon,authenticated,service_role;
grant execute on function public.ceit_add_version(uuid,uuid,uuid,jsonb,text,text) to service_role;

-- No browser read/write policy: only the guarded CE/IT server handlers use this bucket.
-- Restrictive guard also protects CE/IT if an unrelated legacy permissive policy is broad.
create policy ceit_storage_server_only on storage.objects as restrictive for all to anon,authenticated
 using(bucket_id<>'ceit-documents') with check(bucket_id<>'ceit-documents');
do $$ begin
 if exists(select 1 from storage.buckets where id='ceit-documents' and public) then
   raise exception 'ceit-documents must be private before enabling this module';
 end if;
end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ceit-documents','ceit-documents',false,2097152,array['application/pdf'])
on conflict(id) do nothing;
commit;
