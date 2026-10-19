-- Compteur de téléchargements : plus appelable depuis le navigateur.
--
-- NON APPLIQUÉE automatiquement. increment_download_count (SECURITY DEFINER)
-- était exécutable par anon et authenticated : n'importe qui pouvait gonfler
-- le compteur d'une fiche par un simple appel RPC. Depuis ce correctif, la
-- route /api/fiches/[id]/access l'appelle avec le client de service, dans les
-- trois branches (gratuit, carte membre, achat) ; le code fonctionne donc
-- avant comme après cette migration.
--
-- Renommée (ex-20261018_120000) pour passer après les migrations de main. Idempotente.

revoke execute on function public.increment_download_count(uuid) from anon, authenticated, public;
grant execute on function public.increment_download_count(uuid) to service_role;
