-- producer_announcements : on ne peut rattacher une annonce qu'à une coopérative
-- dont on est membre ou administrateur.
--
-- Défaut corrigé. Le WITH CHECK de `announcements_owner` contenait
--     NOT (m.cooperative_id IS DISTINCT FROM m.cooperative_id)
-- soit la colonne comparée à ELLE-MÊME : toujours vrai. Le contrôle visé —
-- « la coopérative de l'annonce est celle de la fiche » — n'existait pas.
--
-- Et ce n'était pas la seule porte : la branche `member_id IS NULL` (annonce
-- sans fiche, cas des comptes Haroo) ne contrôlait rien du tout sur
-- cooperative_id. Mesuré sur la base avant correction, en transaction annulée :
--   - un admin pouvait rattacher une annonce à une AUTRE coopérative ;
--   - un SIMPLE compte, sans aucun droit, pouvait la rattacher à n'importe
--     laquelle.
-- La colonne sert à `org_admin_access(cooperative_id)` dans USING : les
-- administrateurs d'une coopérative gèrent les lignes qui la portent.
-- Attribuer à tort une annonce à une coopérative la fait donc apparaître dans
-- son périmètre d'administration.
--
-- Le contrôle vaut aussi pour UPDATE (même WITH CHECK) : l'auteur ne peut plus
-- changer cooperative_id après coup.
--
-- ORDRE DE DÉPLOIEMENT : la route /api/verify/[card]/announcements doit écrire
-- la coopérative de la FICHE (members.cooperative_id) et non celle de la carte
-- avant que cette migration soit appliquée. Les deux diffèrent pour au moins
-- une carte (FEN-66261, émise par la faîtière FENOMAT pour un membre de
-- HAROFEMA) : sous la nouvelle règle, une annonce portant la coopérative de la
-- carte serait refusée (42501). La route corrigée est valable sous l'ancienne
-- comme sous la nouvelle politique, donc la déployer en premier est sans risque.
--
-- La clause USING est reprise À L'IDENTIQUE. Idempotente.

drop policy if exists announcements_owner on public.producer_announcements;

create policy announcements_owner on public.producer_announcements
  for all
  to authenticated
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
