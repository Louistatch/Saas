-- market_listings : écrire et supprimer ne revient plus à tout le monde dans la coopérative.
--
-- Avant : les politiques INSERT / UPDATE / DELETE (rôle public) laissaient tout
-- compte rattaché à la coopérative modifier ou supprimer TOUTES ses annonces
-- (`auth.uid() IN (SELECT id FROM profiles WHERE cooperative_id = …)`), même un
-- simple membre sur la vente d'un autre.
--
-- Après : on agit sur une vente si l'on administre la coopérative, ou si l'on est
-- le propriétaire de la fiche membre qui vend. L'insertion exige en plus que la
-- fiche appartienne bien à la coopérative annoncée.
--
-- La lecture ne change pas : réservée aux comptes connectés (`listings readable
-- by authenticated`). La page d'exploitation lit désormais les ventes par la
-- route serveur de la carte, cantonnée à card.member_id.
--
-- Idempotente.

drop policy if exists "listings delete own coop" on public.market_listings;
drop policy if exists "listings insert own coop" on public.market_listings;
drop policy if exists "listings update own coop" on public.market_listings;
drop policy if exists listings_insert on public.market_listings;
drop policy if exists listings_update on public.market_listings;
drop policy if exists listings_delete on public.market_listings;

create policy listings_insert on public.market_listings
  for insert to authenticated
  with check (
    exists (
      select 1 from public.members m
      where m.id = market_listings.member_id
        and m.cooperative_id = market_listings.cooperative_id
        and (
          private.org_admin_access(m.cooperative_id)
          or private.owns_member(m.cooperative_id, m.email)
        )
    )
  );

create policy listings_update on public.market_listings
  for update to authenticated
  using (
    private.org_admin_access(cooperative_id)
    or exists (
      select 1 from public.members m
      where m.id = market_listings.member_id
        and private.owns_member(m.cooperative_id, m.email)
    )
  )
  with check (
    exists (
      select 1 from public.members m
      where m.id = market_listings.member_id
        and m.cooperative_id = market_listings.cooperative_id
        and (
          private.org_admin_access(m.cooperative_id)
          or private.owns_member(m.cooperative_id, m.email)
        )
    )
  );

create policy listings_delete on public.market_listings
  for delete to authenticated
  using (
    private.org_admin_access(cooperative_id)
    or exists (
      select 1 from public.members m
      where m.id = market_listings.member_id
        and private.owns_member(m.cooperative_id, m.email)
    )
  );
