-- Compteur de téléchargements : plus appelable depuis le navigateur.
--
-- NON APPLIQUÉE automatiquement. increment_download_count (SECURITY DEFINER)
-- était exécutable par anon et authenticated : n'importe qui pouvait gonfler
-- le compteur d'une fiche par un simple appel RPC. Depuis ce correctif, la
-- route /api/fiches/[id]/access l'appelle avec le client de service, dans les
-- trois branches (gratuit, carte membre, achat) ; le code FUSIONNÉ fonctionne
-- donc avant comme après cette migration.
--
-- ORDRE DE DÉPLOIEMENT : à appliquer SEULEMENT APRÈS la mise en ligne sur Vercel
-- du code fusionné (claude/magical-wright-iP5e8). Le code de main encore en ligne
-- appelle increment_download_count avec le client de SESSION (téléchargement
-- gratuit et carte membre) : après ce REVOKE, l'appel est refusé, son repli
-- .update() ne touche aucune ligne (écriture réservée à fiches_super_admin_all),
-- et le compteur cesserait d'augmenter sans erreur visible.
--
-- Renommée (ex-20261018_120000) pour passer après les migrations de main. Idempotente.

revoke execute on function public.increment_download_count(uuid) from anon, authenticated, public;
grant execute on function public.increment_download_count(uuid) to service_role;
