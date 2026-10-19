-- HarooLife D4+ (M2) : campagnes des panneaux 3D, historique des versions, statistiques agrégées.
-- Aucune vente, aucun paiement : une campagne partenaire n'est approuvée qu'avec une référence de
-- contrat saisie après validation commerciale hors du jeu, et des droits d'image confirmés.
-- Statistiques : compteurs par jour, campagne et support ; aucune donnée personnelle.
-- Additif. NON APPLIQUÉE en production tant que le fondateur ne l'a pas validée.
-- Retour arrière : supabase/rollbacks/20261013_130000_haroolife_ads.rollback.sql

CREATE TABLE public.haroolife_ad_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_name text NOT NULL CHECK (length(advertiser_name) BETWEEN 1 AND 80),
  advertiser_kind text NOT NULL DEFAULT 'partner' CHECK (advertiser_kind IN ('internal', 'partner')),
  creative jsonb NOT NULL,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'pending', 'approved', 'active', 'paused', 'expired')),
  locality text NOT NULL CHECK (locality IN ('lome', 'kara', 'all')),
  placements text[] NOT NULL DEFAULT '{}',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  weight smallint NOT NULL DEFAULT 1 CHECK (weight BETWEEN 1 AND 5),
  rights_confirmed boolean NOT NULL DEFAULT false,
  contract_ref text CHECK (contract_ref IS NULL OR length(contract_ref) BETWEEN 3 AND 80),
  version integer NOT NULL DEFAULT 1,
  updated_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.haroolife_ad_campaign_versions (
  campaign_id uuid NOT NULL REFERENCES public.haroolife_ad_campaigns(id) ON DELETE CASCADE,
  version integer NOT NULL,
  snapshot jsonb NOT NULL,
  changed_by uuid REFERENCES public.profiles(id),
  changed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campaign_id, version)
);
CREATE TABLE public.haroolife_ad_stats (
  day date NOT NULL,
  campaign text NOT NULL CHECK (length(campaign) BETWEEN 1 AND 64),
  placement text NOT NULL CHECK (placement ~ '^(lome|kara)-[a-z-]{2,24}$'),
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (day, campaign, placement)
);
ALTER TABLE public.haroolife_ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_ad_campaign_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_ad_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_ad_campaigns, public.haroolife_ad_campaign_versions, public.haroolife_ad_stats
  FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_ad_campaigns, public.haroolife_ad_campaign_versions, public.haroolife_ad_stats
  TO service_role;

CREATE OR REPLACE FUNCTION private.haroolife_ad_is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = (SELECT auth.uid()) AND role = 'super_admin' AND deleted_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION private.haroolife_ad_json(c public.haroolife_ad_campaigns)
RETURNS jsonb LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'advertiser', jsonb_build_object('name', c.advertiser_name, 'kind', c.advertiser_kind),
    'creative', c.creative, 'status', c.status, 'locality', c.locality, 'placements', to_jsonb(c.placements),
    'startsAt', c.starts_at, 'endsAt', c.ends_at, 'weight', c.weight, 'version', c.version)
$$;

-- Lecture publique : seulement ce qui tourne maintenant (approuvé ou actif, dans sa fenêtre).
CREATE OR REPLACE FUNCTION public.haroolife_ads_live(p_locality text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(private.haroolife_ad_json(c) ORDER BY c.updated_at DESC), '[]')
  FROM public.haroolife_ad_campaigns c
  WHERE c.status IN ('approved', 'active') AND now() >= c.starts_at AND now() < c.ends_at
    AND c.locality IN (p_locality, 'all') AND c.rights_confirmed
    AND (c.advertiser_kind = 'internal' OR c.contract_ref IS NOT NULL)
$$;

-- Compteurs agrégés, plafonnés par envoi (l'API limite aussi le débit par adresse).
CREATE OR REPLACE FUNCTION public.haroolife_ad_record(p_items jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE it jsonb; n integer := 0; imp integer; clk integer;
BEGIN
  IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 8 THEN
    RAISE EXCEPTION 'Lot invalide' USING ERRCODE = '22023';
  END IF;
  FOR it IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    imp := least(greatest(coalesce((it->>'impressions')::integer, 0), 0), 30);
    clk := least(greatest(coalesce((it->>'clicks')::integer, 0), 0), 3);
    CONTINUE WHEN imp = 0 AND clk = 0;
    CONTINUE WHEN coalesce(it->>'placement', '') !~ '^(lome|kara)-[a-z-]{2,24}$';
    -- Seules les campagnes connues comptent : internes (internal-*) ou présentes en base.
    CONTINUE WHEN NOT ((it->>'campaign') ~ '^internal-[a-z-]{2,30}$'
      OR EXISTS (SELECT 1 FROM public.haroolife_ad_campaigns c WHERE c.id::text = it->>'campaign'
                 AND c.status IN ('approved', 'active')));
    INSERT INTO public.haroolife_ad_stats(day, campaign, placement, impressions, clicks)
      VALUES ((now() AT TIME ZONE 'UTC')::date, it->>'campaign', it->>'placement', imp, clk)
      ON CONFLICT (day, campaign, placement) DO UPDATE
      SET impressions = public.haroolife_ad_stats.impressions + excluded.impressions,
          clicks = public.haroolife_ad_stats.clicks + excluded.clicks;
    n := n + 1;
  END LOOP;
  RETURN n;
END $$;

-- Console d'administration (super_admin seulement, vérifié ici et par le layout serveur).
CREATE OR REPLACE FUNCTION public.haroolife_ad_admin_list()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NOT private.haroolife_ad_is_admin() THEN RAISE EXCEPTION 'Réservé à l''équipe' USING ERRCODE = '42501'; END IF;
  RETURN jsonb_build_object(
    'campaigns', coalesce((SELECT jsonb_agg(private.haroolife_ad_json(c) || jsonb_build_object(
        'rightsConfirmed', c.rights_confirmed, 'contractRef', c.contract_ref,
        'versions', (SELECT count(*) FROM public.haroolife_ad_campaign_versions v WHERE v.campaign_id = c.id))
      ORDER BY c.updated_at DESC) FROM public.haroolife_ad_campaigns c), '[]'),
    'stats', coalesce((SELECT jsonb_agg(jsonb_build_object('campaign', s.campaign, 'placement', s.placement,
        'impressions', s.impressions, 'clicks', s.clicks) ORDER BY s.campaign, s.placement)
      FROM (SELECT campaign, placement, sum(impressions) AS impressions, sum(clicks) AS clicks
            FROM public.haroolife_ad_stats WHERE day > (now() AT TIME ZONE 'UTC')::date - 30
            GROUP BY campaign, placement) s), '[]'));
END $$;

CREATE OR REPLACE FUNCTION private.haroolife_ad_snapshot(c public.haroolife_ad_campaigns, p_by uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.haroolife_ad_campaign_versions(campaign_id, version, snapshot, changed_by)
  VALUES (c.id, c.version, private.haroolife_ad_json(c) || jsonb_build_object(
    'rightsConfirmed', c.rights_confirmed, 'contractRef', c.contract_ref), p_by)
  ON CONFLICT (campaign_id, version) DO NOTHING
$$;

-- Créer (brouillon) ou modifier une campagne. Une campagne en cours ne se modifie pas : on la met
-- en pause d'abord. Chaque modification crée une version.
CREATE OR REPLACE FUNCTION public.haroolife_ad_admin_save(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); c public.haroolife_ad_campaigns; cr jsonb := p->'creative';
BEGIN
  IF NOT private.haroolife_ad_is_admin() THEN RAISE EXCEPTION 'Réservé à l''équipe' USING ERRCODE = '42501'; END IF;
  IF cr IS NULL OR length(coalesce(cr->>'title', '')) NOT BETWEEN 1 AND 60
     OR length(coalesce(cr->>'body', '')) NOT BETWEEN 1 AND 140
     OR length(coalesce(cr->>'cta', '')) NOT BETWEEN 1 AND 30
     OR NOT (coalesce(cr->>'href', '') ~ '^/[A-Za-z0-9_./?=&%#-]*$'
             OR coalesce(cr->>'href', '') ~ '^https://(www\.)?faitierehub\.com(/[A-Za-z0-9_./?=&%#-]*)?$')
     OR jsonb_typeof(cr->'palette') <> 'array' OR jsonb_array_length(cr->'palette') <> 3 THEN
    RAISE EXCEPTION 'Créatif invalide (titre ≤ 60, texte ≤ 140, lien du site ou faitierehub.com)' USING ERRCODE = '22023';
  END IF;
  IF p ? 'id' AND p->>'id' IS NOT NULL THEN
    SELECT * INTO c FROM public.haroolife_ad_campaigns WHERE id = (p->>'id')::uuid FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Campagne introuvable' USING ERRCODE = '22023'; END IF;
    IF c.status IN ('active', 'approved', 'expired') THEN
      RAISE EXCEPTION 'Mettez la campagne en pause avant de la modifier' USING ERRCODE = '22023';
    END IF;
    UPDATE public.haroolife_ad_campaigns SET
      advertiser_name = coalesce(p->>'advertiser', advertiser_name), creative = cr,
      locality = coalesce(p->>'locality', locality),
      placements = coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'placements')), placements),
      starts_at = coalesce((p->>'startsAt')::timestamptz, starts_at), ends_at = coalesce((p->>'endsAt')::timestamptz, ends_at),
      weight = coalesce((p->>'weight')::smallint, weight),
      rights_confirmed = coalesce((p->>'rightsConfirmed')::boolean, rights_confirmed),
      contract_ref = CASE WHEN p ? 'contractRef' THEN nullif(trim(p->>'contractRef'), '') ELSE contract_ref END,
      version = version + 1, updated_by = actor, updated_at = now()
      WHERE id = c.id RETURNING * INTO c;
  ELSE
    INSERT INTO public.haroolife_ad_campaigns(advertiser_name, advertiser_kind, creative, locality, placements,
      starts_at, ends_at, weight, rights_confirmed, contract_ref, updated_by)
    VALUES (p->>'advertiser', coalesce(p->>'kind', 'partner'), cr, coalesce(p->>'locality', 'lome'),
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'placements')), '{}'),
      (p->>'startsAt')::timestamptz, (p->>'endsAt')::timestamptz, coalesce((p->>'weight')::smallint, 1),
      coalesce((p->>'rightsConfirmed')::boolean, false), nullif(trim(p->>'contractRef'), ''), actor)
    RETURNING * INTO c;
  END IF;
  PERFORM private.haroolife_ad_snapshot(c, actor);
  RETURN private.haroolife_ad_json(c);
END $$;

-- Changer de statut selon le circuit : brouillon → en revue → approuvée → en cours ⇄ en pause → expirée.
CREATE OR REPLACE FUNCTION public.haroolife_ad_admin_move(p_id uuid, p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); c public.haroolife_ad_campaigns; ok boolean;
BEGIN
  IF NOT private.haroolife_ad_is_admin() THEN RAISE EXCEPTION 'Réservé à l''équipe' USING ERRCODE = '42501'; END IF;
  SELECT * INTO c FROM public.haroolife_ad_campaigns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Campagne introuvable' USING ERRCODE = '22023'; END IF;
  ok := (c.status, p_status) IN (('draft','pending'), ('pending','approved'), ('pending','draft'),
    ('approved','active'), ('approved','paused'), ('active','paused'), ('active','expired'),
    ('paused','active'), ('paused','expired'));
  IF NOT ok THEN RAISE EXCEPTION 'Passage % → % non autorisé', c.status, p_status USING ERRCODE = '22023'; END IF;
  IF p_status = 'approved' AND NOT c.rights_confirmed THEN
    RAISE EXCEPTION 'Confirmez d''abord les droits sur les images et textes' USING ERRCODE = '22023';
  END IF;
  IF p_status = 'approved' AND c.advertiser_kind = 'partner' AND c.contract_ref IS NULL THEN
    RAISE EXCEPTION 'Référence de contrat requise : validation commerciale hors du jeu' USING ERRCODE = '22023';
  END IF;
  UPDATE public.haroolife_ad_campaigns SET status = p_status, version = version + 1, updated_by = actor, updated_at = now()
    WHERE id = p_id RETURNING * INTO c;
  PERFORM private.haroolife_ad_snapshot(c, actor);
  RETURN private.haroolife_ad_json(c);
END $$;

-- Revenir au créatif d'une version antérieure (la campagne repasse en brouillon pour revue).
CREATE OR REPLACE FUNCTION public.haroolife_ad_admin_rollback(p_id uuid, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); s jsonb; c public.haroolife_ad_campaigns;
BEGIN
  IF NOT private.haroolife_ad_is_admin() THEN RAISE EXCEPTION 'Réservé à l''équipe' USING ERRCODE = '42501'; END IF;
  SELECT snapshot INTO s FROM public.haroolife_ad_campaign_versions WHERE campaign_id = p_id AND version = p_version;
  IF s IS NULL THEN RAISE EXCEPTION 'Version introuvable' USING ERRCODE = '22023'; END IF;
  UPDATE public.haroolife_ad_campaigns SET creative = s->'creative', status = 'draft',
    version = version + 1, updated_by = actor, updated_at = now() WHERE id = p_id RETURNING * INTO c;
  PERFORM private.haroolife_ad_snapshot(c, actor);
  RETURN private.haroolife_ad_json(c);
END $$;

REVOKE ALL ON FUNCTION private.haroolife_ad_is_admin(), private.haroolife_ad_json(public.haroolife_ad_campaigns),
  private.haroolife_ad_snapshot(public.haroolife_ad_campaigns, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_ads_live(text), public.haroolife_ad_record(jsonb),
  public.haroolife_ad_admin_list(), public.haroolife_ad_admin_save(jsonb),
  public.haroolife_ad_admin_move(uuid, text), public.haroolife_ad_admin_rollback(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.haroolife_ads_live(text), public.haroolife_ad_record(jsonb)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.haroolife_ad_admin_list(), public.haroolife_ad_admin_save(jsonb),
  public.haroolife_ad_admin_move(uuid, text), public.haroolife_ad_admin_rollback(uuid, integer)
  TO authenticated, service_role;
