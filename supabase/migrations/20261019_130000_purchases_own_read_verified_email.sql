-- Achats : e-mail de l'acheteur lu sur le compte d'authentification CONFIRMÉ, coordonnées de
-- l'acheteur masquées, profiles.email plus modifiable depuis le navigateur.
--
-- NON APPLIQUÉE automatiquement. À appliquer APRÈS 20261018_100000_fiches_sales_integrity.sql
-- (main), dont elle garde les garanties et qu'elle resserre. Idempotente.
--
-- NE JAMAIS (ré)appliquer 20261018_100000 APRÈS celle-ci : son « drop policy if exists
-- purchases_own_read; create policy … auth.jwt()->>'email' » remettrait sans erreur l'e-mail du
-- jeton, non confirmé. Les sept migrations du 18-19/10 s'appliquent en une passe, dans l'ordre
-- des noms, une fois chacune. Contrôle après application (doit renvoyer une ligne) :
--   select 1 from pg_policies where tablename = 'purchases' and policyname = 'purchases_own_read'
--     and qual like '%verified_email%';
-- S'il ne renvoie rien, réappliquer CE fichier (idempotent) rétablit la politique. Le code
-- (app/api/purchases/mine) fonctionne avant comme après : il filtre déjà explicitement sur
-- user_id ou sur l'e-mail VÉRIFIÉ de auth.users, et ne lit que des colonnes autorisées ci-dessous.
--
-- 1. purchases_own_read. 20261018_100000 a fermé la faille (buyer_email comparé à
--    profiles.email, modifiable par chacun) en lisant l'e-mail du jeton de session. On garde :
--    jamais profiles.email, achat rattaché au compte (user_id), e-mail sans casse, buyer_email
--    NULL ne donne rien. On ajoute : l'e-mail doit être CONFIRMÉ (auth.users.email_confirmed_at),
--    et il est relu sur auth.users à chaque requête (un ancien jeton ne garde pas une adresse
--    abandonnée). Même règle que private.owns_member pour les membres.

create schema if not exists private;

create or replace function private.verified_email()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select lower(u.email)
  from auth.users u
  where u.id = (select auth.uid())
    and u.email_confirmed_at is not null
$$;

comment on function private.verified_email() is
  'E-mail de connexion (auth.users) du compte courant, en minuscules, seulement s''il est confirmé. Jamais profiles.email.';

revoke all on function private.verified_email() from public, anon;
grant execute on function private.verified_email() to authenticated, service_role;

drop policy if exists purchases_own_read on public.purchases;
create policy purchases_own_read on public.purchases
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      buyer_email is not null
      and lower(buyer_email) = (select private.verified_email())
    )
  );

-- 2. profiles.email n'est plus modifiable depuis le navigateur. Plus aucune politique ne le
--    lit, mais des routes serveur cherchent encore un compte par profiles.email (approbation
--    d'une demande d'accès, app/api/admin/messages/[id]/approve) : y écrire l'adresse d'un
--    autre ne doit pas être possible. Un REVOKE de colonne est sans effet tant que le droit
--    UPDATE existe sur la TABLE : on retire donc le droit de table, puis on le rend colonne par
--    colonne, sauf email (aucun écran ne met à jour profiles.email avec le client de session ;
--    les déclencheurs SECURITY DEFINER et service_role ne sont pas concernés). Les autres
--    colonnes restent soumises au déclencheur protect_profile_privileges.
--    NB : une colonne ajoutée plus tard à profiles devra recevoir son GRANT UPDATE.
revoke update on public.profiles from authenticated;
do $$
declare
  cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'profiles'
    and column_name <> 'email';
  if cols is not null then
    execute format('grant update (%s) on public.profiles to authenticated', cols);
  end if;
end $$;

-- 3. Téléphone et nom de l'acheteur : jamais lisibles par un client connecté
--    (même au super_admin via purchases_admin_all : les écrans admin passent
--    par les routes serveur, avec le client de service). Revérifié après la
--    fusion avec main (19/10) : aucun appel authentifié ne fait select('*') sur
--    purchases, aucune vue ni fonction ne la lit ; seule /api/purchases/mine
--    lit avec le client de session, avec des colonnes explicites.
--    anon n'a aucune politique de lecture : son droit SELECT est retiré aussi.
revoke select on public.purchases from anon, authenticated;
grant select (
  id, fiche_id, buyer_email, amount, currency, payment_status, access_granted,
  created_at, user_id, provider, provider_transaction_id, paid_at, updated_at
) on public.purchases to authenticated;
