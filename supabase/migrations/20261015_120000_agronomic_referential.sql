-- Référentiel agronomique versionné et comptes d'exploitation calculés.
-- Cette couche complète les tables historiques cultures, fiches_techniques,
-- market_prices et purchases sans modifier leurs parcours existants.

create table if not exists public.agronomic_sources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  owner text not null,
  url text,
  source_type text not null check (source_type in ('official','research','international','field','internal')),
  rights_status text not null default 'to_confirm' check (rights_status in ('open','authorized','to_confirm','restricted')),
  license text,
  published_at date,
  checked_at timestamptz,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.agro_ecological_zones (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.canton_aez_map (
  canton_id uuid primary key references public.cantons(id) on delete cascade,
  zone_id uuid not null references public.agro_ecological_zones(id) on delete restrict,
  source_id uuid references public.agronomic_sources(id) on delete set null,
  review_status text not null default 'draft' check (review_status in ('draft','reviewed','published')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.agronomic_templates (
  id uuid primary key default gen_random_uuid(),
  culture_id uuid not null references public.cultures(id) on delete restrict,
  variety_name text,
  zone_id uuid references public.agro_ecological_zones(id) on delete restrict,
  production_system text not null default 'rainfed',
  title text not null,
  description text,
  status text not null default 'draft' check (status in ('draft','in_review','published','archived')),
  current_version_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (culture_id, variety_name, zone_id, production_system)
);

create table if not exists public.agronomic_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.agronomic_templates(id) on delete cascade,
  version integer not null check (version > 0),
  valid_from date,
  valid_until date,
  seed_rate_kg_ha numeric(10,2),
  yield_low_t_ha numeric(10,2),
  yield_typical_t_ha numeric(10,2),
  yield_high_t_ha numeric(10,2),
  loss_rate_percent numeric(5,2) not null default 0 check (loss_rate_percent >= 0 and loss_rate_percent < 100),
  assumptions jsonb not null default '{}'::jsonb,
  source_ids uuid[] not null default '{}',
  review_status text not null default 'draft' check (review_status in ('draft','in_review','approved','rejected','expired')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version),
  check (yield_low_t_ha is null or yield_typical_t_ha is null or yield_low_t_ha <= yield_typical_t_ha),
  check (yield_typical_t_ha is null or yield_high_t_ha is null or yield_typical_t_ha <= yield_high_t_ha)
);

alter table public.agronomic_templates
  drop constraint if exists agronomic_templates_current_version_fk;
alter table public.agronomic_templates
  add constraint agronomic_templates_current_version_fk
  foreign key (current_version_id) references public.agronomic_template_versions(id) on delete set null;

create table if not exists public.agronomic_operations (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.agronomic_template_versions(id) on delete cascade,
  position integer not null check (position > 0),
  phase text not null,
  label text not null,
  start_day_after_sowing integer,
  end_day_after_sowing integer,
  trigger_condition text,
  instructions text,
  inputs jsonb not null default '[]'::jsonb,
  labour jsonb not null default '[]'::jsonb,
  safety_notes text,
  source_id uuid references public.agronomic_sources(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (version_id, position),
  check (end_day_after_sowing is null or start_day_after_sowing is null or end_day_after_sowing >= start_day_after_sowing)
);

create table if not exists public.enterprise_budget_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  fiche_id uuid references public.fiches_techniques(id) on delete set null,
  purchase_id uuid references public.purchases(id) on delete set null,
  template_version_id uuid references public.agronomic_template_versions(id) on delete restrict,
  region_id uuid references public.regions(id) on delete set null,
  prefecture_id uuid references public.prefectures(id) on delete set null,
  canton_id uuid references public.cantons(id) on delete set null,
  area_ha numeric(12,4) not null check (area_ha > 0),
  campaign text,
  inputs jsonb not null,
  results jsonb not null,
  source_manifest jsonb not null default '[]'::jsonb,
  completeness_score integer not null default 0 check (completeness_score between 0 and 100),
  status text not null default 'draft' check (status in ('draft','quoted','paid','generated','cancelled')),
  immutable_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists agronomic_templates_lookup_idx on public.agronomic_templates(culture_id, zone_id, status);
create index if not exists agronomic_versions_template_idx on public.agronomic_template_versions(template_id, version desc);
create index if not exists agronomic_operations_version_idx on public.agronomic_operations(version_id, position);
create index if not exists enterprise_budget_user_idx on public.enterprise_budget_snapshots(user_id, created_at desc);

alter table public.fiches_techniques add column if not exists agronomic_template_version_id uuid
  references public.agronomic_template_versions(id) on delete set null;
alter table public.fiches_techniques add column if not exists generation_mode text not null default 'uploaded'
  check (generation_mode in ('uploaded','generated'));

alter table public.agronomic_sources enable row level security;
alter table public.agro_ecological_zones enable row level security;
alter table public.canton_aez_map enable row level security;
alter table public.agronomic_templates enable row level security;
alter table public.agronomic_template_versions enable row level security;
alter table public.agronomic_operations enable row level security;
alter table public.enterprise_budget_snapshots enable row level security;

-- Les références publiées sont lisibles ; toutes les écritures restent au super-admin.
create policy agronomic_sources_public_read on public.agronomic_sources for select using (active);
create policy agro_zones_public_read on public.agro_ecological_zones for select using (true);
create policy canton_aez_published_read on public.canton_aez_map for select using (review_status = 'published');
create policy agronomic_templates_published_read on public.agronomic_templates for select using (status = 'published');
create policy agronomic_versions_approved_read on public.agronomic_template_versions for select using (review_status = 'approved');
create policy agronomic_operations_approved_read on public.agronomic_operations for select using (
  exists (select 1 from public.agronomic_template_versions v where v.id = version_id and v.review_status = 'approved')
);

create policy agronomic_sources_super_admin_all on public.agronomic_sources for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy agro_zones_super_admin_all on public.agro_ecological_zones for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy canton_aez_super_admin_all on public.canton_aez_map for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy agronomic_templates_super_admin_all on public.agronomic_templates for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy agronomic_versions_super_admin_all on public.agronomic_template_versions for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy agronomic_operations_super_admin_all on public.agronomic_operations for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

create policy enterprise_budget_own_read on public.enterprise_budget_snapshots for select to authenticated
  using (user_id = auth.uid() or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));
create policy enterprise_budget_own_insert on public.enterprise_budget_snapshots for insert to authenticated
  with check (user_id = auth.uid());
create policy enterprise_budget_super_admin_all on public.enterprise_budget_snapshots for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'super_admin'));

insert into public.agro_ecological_zones(code, name, description) values
  ('TG-LITTORAL', 'Littoral', 'Zone agroécologique littorale du Togo'),
  ('TG-FOREST', 'Zone forestière', 'Zone forestière et humide'),
  ('TG-WET-SAVANNAH', 'Savane humide', 'Zone de savane humide'),
  ('TG-DRY-SAVANNAH', 'Savane sèche', 'Zone de savane sèche')
on conflict (code) do update set name = excluded.name, description = excluded.description;

insert into public.agronomic_sources(code, name, owner, url, source_type, rights_status, published_at, checked_at, notes) values
  ('ITRA-ICAT-MAIS-2008', 'Bien cultiver et conserver le maïs', 'ITRA / ICAT', 'https://icat.tg/wp-content/uploads/2024/09/Mais-1.pdf', 'official', 'to_confirm', '2008-02-01', now(), 'Référence technique ancienne : ne pas utiliser ses prix ni ses marques phytosanitaires.'),
  ('SIHAM-FSRP2-2026-01', 'Analyses du marché agricole du Togo — volume 1', 'SIHAM / FSRP 2 / IFDC', 'https://ifdc.org/wp-content/uploads/2026/05/FR_2026-SIHAM-FSRP-TOGO-ANALYSES-DU-MARCHE-AGRICOLE.pdf', 'official', 'to_confirm', '2026-05-14', now(), 'Prix des engrais, variétés et partenaires publics.'),
  ('FAO-CROP-CALENDAR-TG', 'FAO Crop Calendar — Togo', 'FAO', 'https://api-cropcalendar.apps.fao.org/', 'international', 'to_confirm', '2021-02-26', now(), 'Licence non précisée dans le catalogue ; import en staging et validation requis.'),
  ('ISRIC-SOILGRIDS', 'SoilGrids', 'ISRIC', 'https://docs.isric.org/globaldata/soilgrids/index.html', 'international', 'open', null, now(), 'CC BY 4.0 ; prédiagnostic uniquement.')
on conflict (code) do update set checked_at = excluded.checked_at, notes = excluded.notes;

comment on table public.agronomic_template_versions is 'Versions immuables après approbation ; les PDF et budgets pointent vers une version précise.';
comment on table public.enterprise_budget_snapshots is 'Hypothèses et résultats figés d’un compte d’exploitation ; immutable_at est défini au paiement.';
