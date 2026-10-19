-- Comptes d'exploitation : les ventes restent privées et ne disparaissent plus.
-- Additive, idempotente, aucune donnée supprimée ou modifiée.

-- 1. FAILLE CORRIGÉE : purchases_own_read comparait buyer_email à profiles.email, que chacun
--    peut modifier sur sa propre ligne (profiles_self_update). En y mettant l'e-mail d'un
--    autre acheteur, on lisait ses achats (nom, téléphone), et l'id d'achat sert de jeton de
--    téléchargement. L'e-mail vient désormais du jeton de session : celui du compte
--    d'authentification, qui ne change qu'après confirmation par e-mail.
drop policy if exists purchases_own_read on public.purchases;
create policy purchases_own_read on public.purchases
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or (
      buyer_email is not null
      and lower(buyer_email) = lower((select auth.jwt() ->> 'email'))
    )
  );

-- 2. Supprimer un compte d'exploitation effaçait ses ventes (ON DELETE CASCADE), donc la trace
--    des paiements. Une fiche qui a des achats, même en attente ou échoués, ne se supprime
--    plus : on la retire de la vente (statut archived). L'API le dit avant d'essayer.
do $$
declare
  fk text;
begin
  select c.conname into fk
  from pg_constraint c
  join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
  where c.conrelid = 'public.purchases'::regclass
    and c.contype = 'f'
    and a.attname = 'fiche_id'
    and pg_get_constraintdef(c.oid) not like '%ON DELETE RESTRICT%';
  if fk is not null then
    execute format('alter table public.purchases drop constraint %I', fk);
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.purchases'::regclass and conname = 'purchases_fiche_id_fkey'
  ) then
    alter table public.purchases
      add constraint purchases_fiche_id_fkey foreign key (fiche_id)
      references public.fiches_techniques(id) on delete restrict;
  end if;
end $$;
