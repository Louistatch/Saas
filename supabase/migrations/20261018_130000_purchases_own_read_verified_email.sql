-- Achats : fin de l'usurpation par profiles.email, coordonnées de l'acheteur masquées.
--
-- NON APPLIQUÉE automatiquement. Le code (app/api/purchases/mine) fonctionne
-- avant comme après : il filtre déjà explicitement sur user_id ou sur l'e-mail
-- VÉRIFIÉ de auth.users, et ne lit que des colonnes autorisées ci-dessous.
--
-- 1. FAILLE : purchases_own_read comparait buyer_email à profiles.email, colonne
--    que tout utilisateur connecté peut modifier sur sa propre ligne
--    (protect_profile_privileges ne la protège pas). En y écrivant l'adresse
--    d'un acheteur, on lisait ses achats — et l'id d'achat sert de jeton de
--    téléchargement. La politique lit désormais l'e-mail de auth.users, et
--    seulement s'il est confirmé.

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
    or lower(buyer_email) = (select private.verified_email())
  );

-- 2. profiles.email n'est plus modifiable depuis le navigateur. Un REVOKE de
--    colonne est sans effet tant que le droit UPDATE existe sur la TABLE : on
--    retire donc le droit de table, puis on le rend colonne par colonne, sauf
--    email (aucun écran ne met à jour profiles.email avec le client de session ;
--    les déclencheurs SECURITY DEFINER et service_role ne sont pas concernés).
--    Les autres colonnes restent soumises au déclencheur protect_profile_privileges.
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
--    par les routes serveur, avec le client de service). Vérifié avant
--    d'écrire ces lignes : aucun appel authentifié ne fait select('*') sur
--    purchases ; seule /api/purchases/mine lit, avec des colonnes explicites.
--    anon n'a aucune politique de lecture : son droit SELECT est retiré aussi.
revoke select on public.purchases from anon, authenticated;
grant select (
  id, fiche_id, buyer_email, amount, currency, payment_status, access_granted,
  created_at, user_id, provider, provider_transaction_id, paid_at, updated_at
) on public.purchases to authenticated;
