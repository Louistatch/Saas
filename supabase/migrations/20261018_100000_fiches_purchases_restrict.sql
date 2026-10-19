-- Achats : une fiche vendue ne peut plus être supprimée.
--
-- NON APPLIQUÉE automatiquement. purchases_fiche_id_fkey était en ON DELETE
-- CASCADE : supprimer une fiche effaçait silencieusement ses achats (la seule
-- fiche publiée en compte 23), y compris un achat en attente qu'un webhook
-- FedaPay aurait réglé ensuite. DELETE /api/fiches/[id] refuse déjà (409) une
-- fiche qui a des ventes ; la contrainte en fait une garantie de la base.
--
-- Conséquence assumée : supprimer une coopérative dont une fiche a été vendue
-- échoue aussi (fiches_techniques.cooperative_id est en CASCADE) — retirer la
-- fiche de la vente (status = 'archived') reste toujours possible.

alter table public.purchases drop constraint if exists purchases_fiche_id_fkey;
alter table public.purchases
  add constraint purchases_fiche_id_fkey
  foreign key (fiche_id) references public.fiches_techniques(id) on delete restrict;
