-- Service-only organization resolution. Root IDs, not labels, define tenant boundaries.
-- A root lock serializes two collectors submitting spelling variants at the same time.
CREATE OR REPLACE FUNCTION private.kobo_cooperative_key(p_name text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(string_agg(word, ' ' ORDER BY word), '') FROM (
    SELECT DISTINCT word FROM regexp_split_to_table(
      regexp_replace(regexp_replace(lower(normalize(coalesce(p_name, ''), NFKD)), '[̀-ͯ]', '', 'g'),
        '\ms[.[:space:]]*c[.[:space:]]*o[.[:space:]]*o[.[:space:]]*p[.[:space:]]*s\M', 'scoops', 'g'),
      '[^a-z0-9]+') word
    WHERE word <> '' AND word <> ALL(string_to_array(
      'de du des la le les l d et a au aux en cooperative cooperatives coop coopec scoop scoops sca scaa ca societe ste simplifiee simplifie groupement gpt gie association asso', ' '))
  ) normalized;
$$;
REVOKE ALL ON FUNCTION private.kobo_cooperative_key(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.kobo_resolve_organization(
  p_root uuid, p_parent uuid, p_name text, p_level text DEFAULT 'cooperative', p_match uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_scope uuid[]; v_key text; v_matches uuid[]; v_id uuid; v_name text; v_faitiere text;
BEGIN
  IF p_level NOT IN ('cooperative','union') OR length(btrim(p_name)) NOT BETWEEN 3 AND 200 THEN
    RAISE EXCEPTION 'Invalid organization name or level' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('kobo-organization:' || p_root::text, 0));
  WITH RECURSIVE scope AS (
    SELECT id FROM public.cooperatives WHERE id=p_root AND deleted_at IS NULL
    UNION
    SELECT c.id FROM public.cooperatives c JOIN scope s ON c.parent_id=s.id WHERE c.deleted_at IS NULL
  ) SELECT array_agg(id) INTO v_scope FROM scope;
  IF v_scope IS NULL OR NOT coalesce(p_parent=ANY(v_scope),false) THEN
    RAISE EXCEPTION 'Parent outside configured organization' USING ERRCODE='42501';
  END IF;
  v_key := private.kobo_cooperative_key(p_name);
  IF v_key='' THEN RAISE EXCEPTION 'Organization name has no distinctive word' USING ERRCODE='22023'; END IF;
  SELECT array_agg(c.id) INTO v_matches FROM public.cooperatives c
    WHERE c.id=ANY(v_scope) AND c.level=p_level AND c.deleted_at IS NULL
      AND private.kobo_cooperative_key(c.name)=v_key;
  IF coalesce(cardinality(v_matches),0)>1 THEN
    RAISE EXCEPTION 'Several existing organizations have this name; review required' USING ERRCODE='22023';
  END IF;
  v_id := v_matches[1];
  IF v_id IS NULL AND p_match IS NOT NULL THEN
    SELECT c.id INTO v_id FROM public.cooperatives c WHERE c.id=p_match
      AND c.id=ANY(v_scope) AND c.level=p_level AND c.deleted_at IS NULL;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Match outside configured organization' USING ERRCODE='42501'; END IF;
  END IF;
  IF v_id IS NOT NULL THEN
    SELECT name INTO v_name FROM public.cooperatives WHERE id=v_id;
    RETURN jsonb_build_object('id',v_id,'name',v_name,'method',CASE WHEN v_matches[1] IS NOT NULL THEN 'normalized_exact' ELSE 'distinctive_match' END);
  END IF;
  SELECT coalesce(faitiere_name,name) INTO v_faitiere FROM public.cooperatives WHERE id=p_root;
  INSERT INTO public.cooperatives(name,level,parent_id,faitiere_name)
    VALUES (btrim(regexp_replace(normalize(p_name,NFC),'[[:space:]]+',' ','g')),p_level,p_parent,v_faitiere)
    RETURNING id,name INTO v_id,v_name;
  RETURN jsonb_build_object('id',v_id,'name',v_name,'method','created');
END;
$$;
REVOKE ALL ON FUNCTION public.kobo_resolve_organization(uuid,uuid,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.kobo_resolve_organization(uuid,uuid,text,text,uuid) TO service_role;

-- A Kobo project must not silently route into whichever faîtière happens to be found first.
CREATE UNIQUE INDEX IF NOT EXISTS integrations_connected_kobo_form_unique
  ON public.integrations ((config->>'form_id'))
  WHERE type='kobo' AND status='connected' AND nullif(config->>'form_id','') IS NOT NULL;
