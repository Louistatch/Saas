-- producer_announcements : politiques par commande, rattachement contrôlé, retrait
-- par l'administrateur.
--
-- Deux défauts de l'ancienne politique unique `announcements_owner` (FOR ALL).
--
-- 1. Rattachement non contrôlé. Son WITH CHECK contenait
--        NOT (m.cooperative_id IS DISTINCT FROM m.cooperative_id)
--    soit la colonne comparée à ELLE-MÊME : toujours vrai. Et la branche
--    `member_id IS NULL` (annonce sans fiche, cas des comptes Haroo) ne
--    contrôlait rien du tout sur cooperative_id. Mesuré sur la base avant
--    correction, en transaction annulée : un admin pouvait rattacher une annonce
--    à une AUTRE coopérative, et un SIMPLE compte, sans aucun droit, à n'importe
--    laquelle. La colonne alimente `org_admin_access(cooperative_id)` : une
--    annonce faussement attribuée entre dans le périmètre d'administration de
--    cette coopérative.
--
-- 2. Paradoxe de l'administrateur. Un WITH CHECK écrit pour l'INSERTION
--    (« l'auteur, c'est vous ») s'applique AUSSI à l'UPDATE dans une politique
--    FOR ALL. USING donnait donc accès à l'administrateur et WITH CHECK le lui
--    reprenait : il pouvait voir et supprimer l'annonce d'un autre auteur, mais
--    pas la clôturer.
--
-- Le bon modèle est UNE POLITIQUE PAR COMMANDE :
--   - INSERT : strict. L'auteur est soi-même — un administrateur ne peut pas
--              publier AU NOM d'un autre.
--   - UPDATE : on agit sur ce qu'on gère (auteur, administrateur de la
--              coopérative, ou propriétaire de la fiche). Le nouvel état doit
--              rester cohérent : l'annonce ne peut pas migrer vers une coopérative
--              étrangère.
--   - SELECT / DELETE : on voit et on retire ce qu'on gère. `announcements_public`
--              (annonces actives, visibles de tous) est inchangée.
--
-- « Gérer » = être l'auteur, administrer la coopérative de l'annonce, ou être le
-- propriétaire de la fiche membre. C'était déjà la clause USING de l'ancienne
-- politique ; elle est reprise à l'identique.
--
-- Un déclencheur rend `author_id` IMMUABLE. Sans lui, l'accès en modification
-- donné à l'administrateur lui permettrait de réécrire l'auteur d'une annonce —
-- une usurpation que la politique INSERT interdit justement.
--
-- Vérifié sur 11 cas en évaluant les prédicats sous le rôle `authenticated` avec
-- les vrais comptes : l'administrateur retire l'annonce d'un autre ; un
-- administrateur d'une coopérative ÉTRANGÈRE est refusé en modification comme en
-- insertion ; la publication au nom d'autrui est refusée ; un simple compte ne
-- rattache rien à une coopérative.
--
-- ORDRE DE DÉPLOIEMENT : la route /api/verify/[card]/announcements doit écrire la
-- coopérative de la FICHE (members.cooperative_id) et non celle de la carte avant
-- cette migration. Elles diffèrent pour au moins une carte (FEN-66261, émise par
-- la faîtière FENOMAT pour un membre de HAROFEMA), et sous la nouvelle règle une
-- annonce portant la coopérative de la carte serait refusée (42501). La route
-- corrigée est valable sous l'ancienne comme sous la nouvelle politique.
--
-- Idempotente.

drop policy if exists announcements_owner          on public.producer_announcements;
drop policy if exists announcements_select_managed on public.producer_announcements;
drop policy if exists announcements_insert         on public.producer_announcements;
drop policy if exists announcements_update         on public.producer_announcements;
drop policy if exists announcements_delete         on public.producer_announcements;

-- Voir ses annonces, y compris celles qui ne sont plus actives (la liste
-- « Mes annonces » affiche aussi les annonces retirées).
create policy announcements_select_managed on public.producer_announcements
  for select to authenticated
  using (
    (author_id = (select auth.uid()))
    or private.org_admin_access(cooperative_id)
    or exists (
      select 1 from public.members m
      where m.id = producer_announcements.member_id
        and private.owns_member(m.cooperative_id, m.email)
    )
  );

-- Publier : l'auteur est soi-même, et le rattachement est cohérent.
create policy announcements_insert on public.producer_announcements
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and (
      -- Annonce SANS fiche membre (compte Haroo) : aucune coopérative
      -- revendiquée, sauf à en administrer une.
      (
        member_id is null
        and (cooperative_id is null or private.org_admin_access(cooperative_id))
      )
      or
      -- Annonce rattachée à une fiche : sa coopérative EST celle de la fiche, et
      -- l'auteur en est le propriétaire ou l'administrateur.
      (
        member_id is not null
        and exists (
          select 1 from public.members m
          where m.id = producer_announcements.member_id
            and m.cooperative_id is not distinct from producer_announcements.cooperative_id
            and (
              private.org_admin_access(m.cooperative_id)
              or private.owns_member(m.cooperative_id, m.email)
            )
        )
      )
    )
  );

-- Modifier (dont retirer) ce qu'on gère, sans sortir de sa coopérative.
create policy announcements_update on public.producer_announcements
  for update to authenticated
  using (
    (author_id = (select auth.uid()))
    or private.org_admin_access(cooperative_id)
    or exists (
      select 1 from public.members m
      where m.id = producer_announcements.member_id
        and private.owns_member(m.cooperative_id, m.email)
    )
  )
  with check (
    (
      (author_id = (select auth.uid()))
      or private.org_admin_access(cooperative_id)
      or exists (
        select 1 from public.members m
        where m.id = producer_announcements.member_id
          and private.owns_member(m.cooperative_id, m.email)
      )
    )
    and (
      (
        member_id is null
        and (cooperative_id is null or private.org_admin_access(cooperative_id))
      )
      or
      (
        member_id is not null
        and exists (
          select 1 from public.members m
          where m.id = producer_announcements.member_id
            and m.cooperative_id is not distinct from producer_announcements.cooperative_id
            and (
              private.org_admin_access(m.cooperative_id)
              or private.owns_member(m.cooperative_id, m.email)
            )
        )
      )
    )
  );

-- Supprimer ce qu'on gère.
create policy announcements_delete on public.producer_announcements
  for delete to authenticated
  using (
    (author_id = (select auth.uid()))
    or private.org_admin_access(cooperative_id)
    or exists (
      select 1 from public.members m
      where m.id = producer_announcements.member_id
        and private.owns_member(m.cooperative_id, m.email)
    )
  );

-- L'auteur d'une annonce ne change jamais. Ce déclencheur vaut pour tous les
-- rôles, service_role compris : il n'existe aucun cas légitime de réattribution.
create or replace function private.announcements_freeze_author()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.author_id is distinct from old.author_id then
    raise exception 'producer_announcements.author_id est immuable'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists announcements_freeze_author on public.producer_announcements;
create trigger announcements_freeze_author
  before update on public.producer_announcements
  for each row execute function private.announcements_freeze_author();
