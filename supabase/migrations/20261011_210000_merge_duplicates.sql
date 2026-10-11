-- Fusion de doublons (organisations et membres) : tout ce qui est rattaché au doublon passe sur la
-- fiche conservée, puis le doublon est archivé (deleted_at). Rien n'est supprimé. Une ligne qui
-- heurterait une contrainte d'unicité reste sur le doublon archivé et est signalée dans le retour.
-- Appel serveur uniquement (service_role), journalisé dans audit_logs.

CREATE OR REPLACE FUNCTION public.merge_members(p_keep uuid, p_dup uuid, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.members; d public.members; fk record; skipped text[] := '{}'; moved text[] := '{}'; n int;
BEGIN
  IF p_keep = p_dup THEN RAISE EXCEPTION 'Même membre'; END IF;
  SELECT * INTO k FROM public.members WHERE id = p_keep AND deleted_at IS NULL;
  SELECT * INTO d FROM public.members WHERE id = p_dup AND deleted_at IS NULL;
  IF k.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'Membre introuvable ou déjà archivé'; END IF;

  -- Une seule carte active par personne : celle du doublon est révoquée si la fiche gardée en a une.
  IF EXISTS (SELECT 1 FROM public.member_cards WHERE member_id = p_keep AND status = 'active') THEN
    UPDATE public.member_cards SET status = 'revoked', revoked_at = now(),
      revoked_reason = 'Doublon fusionné', updated_at = now()
    WHERE member_id = p_dup AND status = 'active';
  END IF;

  -- La fiche gardée récupère ce qui lui manque.
  IF k.phone IS NULL OR k.phone = '' THEN
    UPDATE public.members SET phone = NULL WHERE id = p_dup;
    UPDATE public.members SET phone = d.phone WHERE id = p_keep;
  END IF;
  UPDATE public.members SET
    email = coalesce(email, d.email), date_of_birth = coalesce(date_of_birth, d.date_of_birth),
    address = coalesce(address, d.address), photo_url = coalesce(photo_url, d.photo_url),
    photo_original_url = coalesce(photo_original_url, d.photo_original_url),
    signature_url = coalesce(signature_url, d.signature_url), village = coalesce(village, d.village),
    canton = coalesce(canton, d.canton), prefecture = coalesce(prefecture, d.prefecture),
    region = coalesce(region, d.region), canton_id = coalesce(canton_id, d.canton_id),
    prefecture_id = coalesce(prefecture_id, d.prefecture_id), region_id = coalesce(region_id, d.region_id),
    updated_at = now()
  WHERE id = p_keep;

  FOR fk IN
    SELECT n2.nspname AS sch, c.relname AS tbl, a.attname AS col
    FROM pg_catalog.pg_constraint co
    JOIN pg_catalog.pg_class c ON c.oid = co.conrelid
    JOIN pg_catalog.pg_namespace n2 ON n2.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
    WHERE co.contype = 'f' AND co.confrelid = 'public.members'::regclass
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2', fk.sch, fk.tbl, fk.col, fk.col)
        USING p_keep, p_dup;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN moved := moved || format('%s:%s', fk.tbl, n); END IF;
    EXCEPTION WHEN unique_violation THEN
      skipped := skipped || fk.tbl::text;
    END;
  END LOOP;

  UPDATE public.members SET deleted_at = now(), updated_at = now() WHERE id = p_dup;
  INSERT INTO public.audit_logs(user_id, cooperative_id, action, resource, resource_id, details)
  VALUES (p_actor, k.cooperative_id, 'member.merge', 'members', p_keep::text,
    jsonb_build_object('archived', p_dup, 'archived_name', concat_ws(' ', d.first_name, d.last_name),
      'moved', moved, 'left_on_archive', skipped));
  RETURN jsonb_build_object('kept', p_keep, 'archived', p_dup, 'moved', moved, 'left_on_archive', skipped);
END $$;

CREATE OR REPLACE FUNCTION public.merge_cooperatives(p_keep uuid, p_dup uuid, p_actor uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  k public.cooperatives; d public.cooperatives; fk record; m record;
  skipped text[] := '{}'; moved text[] := '{}'; conflicts int := 0; n int;
BEGIN
  IF p_keep = p_dup THEN RAISE EXCEPTION 'Même organisation'; END IF;
  SELECT * INTO k FROM public.cooperatives WHERE id = p_keep AND deleted_at IS NULL;
  SELECT * INTO d FROM public.cooperatives WHERE id = p_dup AND deleted_at IS NULL;
  IF k.id IS NULL OR d.id IS NULL THEN RAISE EXCEPTION 'Organisation introuvable ou déjà archivée'; END IF;
  IF p_dup IN (SELECT public.coop_lineage(p_keep)) THEN
    RAISE EXCEPTION 'L''organisation à archiver est un parent de celle conservée';
  END IF;

  -- Membres : un par un, pour qu'un téléphone déjà pris dans la fiche gardée ne bloque pas les autres.
  FOR m IN SELECT id FROM public.members WHERE cooperative_id = p_dup AND deleted_at IS NULL LOOP
    BEGIN
      UPDATE public.members SET cooperative_id = p_keep, updated_at = now() WHERE id = m.id;
    EXCEPTION WHEN unique_violation THEN conflicts := conflicts + 1;
    END;
  END LOOP;

  UPDATE public.cooperatives SET parent_id = p_keep WHERE parent_id = p_dup;

  FOR fk IN
    SELECT n2.nspname AS sch, c.relname AS tbl, a.attname AS col
    FROM pg_catalog.pg_constraint co
    JOIN pg_catalog.pg_class c ON c.oid = co.conrelid
    JOIN pg_catalog.pg_namespace n2 ON n2.oid = c.relnamespace
    JOIN pg_catalog.pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = co.conkey[1]
    WHERE co.contype = 'f' AND co.confrelid = 'public.cooperatives'::regclass
      AND c.relname NOT IN ('members', 'cooperatives', 'audit_logs')
  LOOP
    BEGIN
      EXECUTE format('UPDATE %I.%I SET %I = $1 WHERE %I = $2', fk.sch, fk.tbl, fk.col, fk.col)
        USING p_keep, p_dup;
      GET DIAGNOSTICS n = ROW_COUNT;
      IF n > 0 THEN moved := moved || format('%s:%s', fk.tbl, n); END IF;
    EXCEPTION WHEN unique_violation THEN
      skipped := skipped || fk.tbl::text;
    END;
  END LOOP;

  UPDATE public.cooperatives SET
    description = coalesce(description, d.description), village_id = coalesce(village_id, d.village_id),
    coordo_name = coalesce(coordo_name, d.coordo_name), coordo_phone = coalesce(coordo_phone, d.coordo_phone),
    culture_categories = coalesce(culture_categories, d.culture_categories), updated_at = now()
  WHERE id = p_keep;
  UPDATE public.cooperatives SET deleted_at = now(), updated_at = now() WHERE id = p_dup;

  INSERT INTO public.audit_logs(user_id, cooperative_id, action, resource, resource_id, details)
  VALUES (p_actor, p_keep, 'cooperative.merge', 'cooperatives', p_keep::text,
    jsonb_build_object('archived', p_dup, 'archived_name', d.name, 'moved', moved,
      'members_left_on_archive', conflicts, 'left_on_archive', skipped));
  RETURN jsonb_build_object('kept', p_keep, 'archived', p_dup, 'moved', moved,
    'members_left_on_archive', conflicts, 'left_on_archive', skipped);
END $$;

REVOKE ALL ON FUNCTION public.merge_members(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.merge_cooperatives(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_members(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.merge_cooperatives(uuid, uuid, uuid) TO service_role;
