-- Vente des comptes d'exploitation par la plateforme (paiement FedaPay).
-- Idempotente.

-- 1. Fiches « plateforme » : vendues par FaîtiereHub, sans coopérative.
alter table public.fiches_techniques alter column cooperative_id drop not null;
comment on column public.fiches_techniques.cooperative_id is
  'Organisation qui publie la fiche. NULL = fiche de la plateforme FaîtiereHub (vendue par le super-admin).';

-- Le super-admin gère toutes les fiches, y compris celles de la plateforme.
-- (fiches_admin_all ne le laissait écrire que dans SA coopérative.)
drop policy if exists fiches_super_admin_all on public.fiches_techniques;
create policy fiches_super_admin_all on public.fiches_techniques
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'));

-- 2. Achats : rattachés au compte (SaaS comme Haroo) et au paiement.
alter table public.purchases
  add column if not exists user_id uuid references public.profiles(id) on delete set null,
  add column if not exists buyer_name text,
  add column if not exists provider text,
  add column if not exists provider_transaction_id text,
  add column if not exists paid_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();
create unique index if not exists purchases_provider_tx_uidx
  on public.purchases (provider, provider_transaction_id) where provider_transaction_id is not null;
create index if not exists purchases_user_idx on public.purchases (user_id);
create index if not exists purchases_fiche_idx on public.purchases (fiche_id);

-- 3. FAILLE CORRIGÉE : n'importe qui (anon) pouvait insérer un achat
--    payment_status='completed', access_granted=true avec l'id de son choix, puis
--    télécharger une fiche payante via /api/fiches/[id]/access. Les achats ne sont
--    désormais créés et réglés QUE par le serveur (service_role), après
--    vérification du paiement auprès de FedaPay.
drop policy if exists purchases_insert_public on public.purchases;
drop policy if exists purchases_public_insert on public.purchases;
revoke insert, update, delete on public.purchases from anon;

-- Lecture de ses propres achats (compte SaaS ou Haroo).
drop policy if exists purchases_own_read on public.purchases;
create policy purchases_own_read on public.purchases
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or buyer_email in (select p.email from public.profiles p where p.id = (select auth.uid()))
  );

-- Gestion des achats : super-admin uniquement (avant : tout admin de coopérative,
-- toutes coopératives confondues).
drop policy if exists purchases_admin_all on public.purchases;
create policy purchases_admin_all on public.purchases
  for all to authenticated
  using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'))
  with check (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'super_admin'));
