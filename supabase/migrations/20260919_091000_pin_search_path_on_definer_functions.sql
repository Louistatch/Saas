-- ─────────────────────────────────────────────────────────────────────────────
-- Figer le search_path de quatre fonctions SECURITY DEFINER
--
-- Sans search_path figé, l'appelant peut placer un schéma devant `public` et
-- faire résoudre un nom de table, de fonction ou d'opérateur vers un objet
-- qu'il contrôle. Le code détourné s'exécute alors avec les droits du
-- propriétaire de la fonction, pas ceux de l'appelant.
--
-- Deux de ces quatre fonctions restent volontairement appelables par `anon`
-- (voir 20260919_090000) parce que les parcours marketplace et fiche technique
-- sont publics : ce sont donc les plus exposées des quatre.
--
-- ALTER FUNCTION ne touche pas le corps : aucun changement de comportement
-- tant que ces fonctions ne référencent que des objets de `public`, ce qui est
-- le cas. Les quatre ont été rappelées après coup et répondent normalement.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER FUNCTION public.get_dashboard_stats(uuid)      SET search_path = public, pg_temp;
ALTER FUNCTION public.get_member_score(uuid)         SET search_path = public, pg_temp;
ALTER FUNCTION public.increment_download_count(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.search_marketplace(
  text, text, text, uuid, uuid, uuid, uuid, boolean, numeric, numeric,
  text, text, text, text, text, integer, integer
) SET search_path = public, pg_temp;
