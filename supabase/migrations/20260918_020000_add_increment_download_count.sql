CREATE OR REPLACE FUNCTION increment_download_count(target_fiche_id uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  UPDATE fiches_techniques SET download_count = COALESCE(download_count, 0) + 1 WHERE id = target_fiche_id;
$$;
GRANT EXECUTE ON FUNCTION increment_download_count(uuid) TO authenticated, anon;
