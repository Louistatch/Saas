-- Additive pilot. No existing account, policy, announcement or contract is changed.
-- Activation requires BOTH the server flag and this explicit pilot configuration.
CREATE TABLE public.haroolife_pilot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false,
  cooperative_id uuid REFERENCES public.cooperatives(id),
  canton_id uuid REFERENCES public.cantons(id),
  team_target integer NOT NULL DEFAULT 8 CHECK (team_target BETWEEN 2 AND 30),
  area_target numeric(10,4) NOT NULL DEFAULT 10 CHECK (area_target > 0),
  -- Plafond accepté au-delà de la cible (la dernière parcelle peut la dépasser, jamais ce plafond).
  area_max numeric(10,4) NOT NULL DEFAULT 16 CHECK (area_max >= area_target),
  formation_hours integer NOT NULL DEFAULT 48 CHECK (formation_hours BETWEEN 1 AND 168),
  CHECK (NOT enabled OR (cooperative_id IS NOT NULL AND canton_id IS NOT NULL))
);
INSERT INTO public.haroolife_pilot(singleton) VALUES (true);

CREATE TABLE public.haroolife_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id),
  kind text NOT NULL CHECK (kind IN ('team','work')),
  title text NOT NULL CHECK (length(title) BETWEEN 3 AND 100),
  activity text NOT NULL CHECK (activity IN ('recolte','semis','desherbage')),
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id),
  canton_id uuid NOT NULL REFERENCES public.cantons(id),
  starts_on date NOT NULL,
  ends_on date NOT NULL CHECK (ends_on >= starts_on),
  target numeric(10,4) NOT NULL CHECK (target > 0),
  expires_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.haroolife_participations (
  group_id uuid NOT NULL REFERENCES public.haroolife_groups(id),
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  parcel_id uuid REFERENCES public.parcelles(id),
  amount numeric(10,4) NOT NULL CHECK (amount > 0),
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at timestamptz,
  PRIMARY KEY (group_id,user_id)
);
CREATE INDEX haroolife_active_parcel ON public.haroolife_participations(parcel_id) WHERE left_at IS NULL;
CREATE INDEX haroolife_active_user ON public.haroolife_participations(user_id) WHERE left_at IS NULL;
CREATE INDEX haroolife_groups_zone ON public.haroolife_groups(cooperative_id,canton_id,created_at);
CREATE TABLE public.haroolife_events (
  user_id uuid NOT NULL REFERENCES public.profiles(id),
  request_id uuid NOT NULL,
  action text NOT NULL,
  payload jsonb NOT NULL,
  group_id uuid NOT NULL REFERENCES public.haroolife_groups(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,request_id)
);

ALTER TABLE public.haroolife_pilot ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_participations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_pilot,public.haroolife_groups,public.haroolife_participations,public.haroolife_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.haroolife_pilot,public.haroolife_groups,public.haroolife_participations,public.haroolife_events TO service_role;

-- Only definer functions expose a minimal board; raw participant identities stay private.
CREATE OR REPLACE FUNCTION private.haroolife_access()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE cfg public.haroolife_pilot; p public.profiles; worker boolean; producer boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE='42501'; END IF;
  SELECT * INTO cfg FROM public.haroolife_pilot WHERE singleton;
  IF NOT FOUND OR NOT cfg.enabled THEN RAISE EXCEPTION 'Pilote indisponible' USING ERRCODE='55000'; END IF;
  SELECT * INTO p FROM public.profiles WHERE id=auth.uid() AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil requis' USING ERRCODE='42501'; END IF;
  worker := coalesce(p.haroo_type::text,p.role::text)='ouvrier' AND EXISTS (
    SELECT 1 FROM public.haroo_ouvrier_profiles w JOIN public.haroo_ouvrier_cantons c ON c.ouvrier_id=w.id
    WHERE w.user_id=p.id AND w.disponible AND c.canton_id=cfg.canton_id
  );
  producer := EXISTS (
    SELECT 1 FROM public.parcelles pa JOIN public.members m ON m.id=pa.member_id
    WHERE pa.cooperative_id=cfg.cooperative_id AND m.cooperative_id=cfg.cooperative_id
      AND private.owns_member(m.cooperative_id,m.email)
  );
  IF NOT worker AND NOT producer AND NOT private.org_admin_access(cfg.cooperative_id) THEN
    RAISE EXCEPTION 'Ce pilote est réservé à la coopérative et aux ouvriers disponibles dans son canton' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('can_team',worker,'can_work',producer);
END $$;
REVOKE ALL ON FUNCTION private.haroolife_access() FROM PUBLIC,anon,authenticated;

CREATE OR REPLACE FUNCTION public.haroolife_board()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE access jsonb; cfg public.haroolife_pilot; groups jsonb; parcels jsonb;
BEGIN
  access := private.haroolife_access();
  SELECT * INTO cfg FROM public.haroolife_pilot WHERE singleton;
  SELECT coalesce(jsonb_agg(to_jsonb(items)),'[]') INTO groups FROM (
    SELECT g.id,g.kind,g.title,g.activity,g.starts_on,g.ends_on,g.target,g.expires_at,
      coalesce(s.total,0) AS total,coalesce(s.people,0) AS people,
      (g.owner_id=auth.uid()) AS is_owner,
      EXISTS(SELECT 1 FROM public.haroolife_participations me WHERE me.group_id=g.id AND me.user_id=auth.uid() AND me.left_at IS NULL) AS joined,
      CASE WHEN g.cancelled_at IS NOT NULL THEN 'cancelled'
        WHEN g.expires_at<=now() THEN 'expired'
        WHEN coalesce(s.total,0)>=g.target THEN 'ready' ELSE 'open' END AS state
    FROM public.haroolife_groups g
    LEFT JOIN LATERAL (SELECT sum(amount) AS total,count(*) AS people FROM public.haroolife_participations x WHERE x.group_id=g.id AND x.left_at IS NULL) s ON true
    WHERE g.cooperative_id=cfg.cooperative_id AND g.canton_id=cfg.canton_id
    ORDER BY (g.owner_id=auth.uid() OR EXISTS(SELECT 1 FROM public.haroolife_participations me WHERE me.group_id=g.id AND me.user_id=auth.uid() AND me.left_at IS NULL)) DESC,g.created_at DESC LIMIT 100
  ) items;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',pa.id,'culture',pa.culture_principale,'area',pa.superficie_ha)),'[]') INTO parcels
    FROM public.parcelles pa JOIN public.members m ON m.id=pa.member_id
    WHERE pa.cooperative_id=cfg.cooperative_id AND m.cooperative_id=cfg.cooperative_id
      AND pa.superficie_ha>0 AND private.owns_member(m.cooperative_id,m.email);
  RETURN jsonb_build_object('access',access,'groups',groups,'parcels',parcels,
    'pilot',jsonb_build_object('team_target',cfg.team_target,'area_target',cfg.area_target,'area_max',cfg.area_max,'formation_hours',cfg.formation_hours,
      'canton',(SELECT name FROM public.cantons WHERE id=cfg.canton_id),
      'cooperative',(SELECT name FROM public.cooperatives WHERE id=cfg.cooperative_id)));
END $$;
REVOKE ALL ON FUNCTION public.haroolife_board() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.haroolife_board() TO authenticated;

CREATE OR REPLACE FUNCTION public.haroolife_command(p_action text,p_request_id uuid,p_payload jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  access jsonb; cfg public.haroolife_pilot; g public.haroolife_groups;
  prior public.haroolife_events; actor uuid:=auth.uid(); parcel public.parcelles;
  contribution numeric; total numeric; parcel_id uuid;
BEGIN
  access := private.haroolife_access();
  IF p_request_id IS NULL OR p_action IS NULL OR p_action NOT IN ('create','join','leave','cancel') OR p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' THEN
    RAISE EXCEPTION 'Commande invalide' USING ERRCODE='22023';
  END IF;
  -- Serializes retries and concurrent formations by the same worker.
  PERFORM pg_advisory_xact_lock(hashtextextended(actor::text,0));
  SELECT * INTO prior FROM public.haroolife_events WHERE user_id=actor AND request_id=p_request_id;
  IF FOUND THEN
    IF prior.action<>p_action OR prior.payload<>p_payload THEN RAISE EXCEPTION 'Identifiant de requête déjà utilisé' USING ERRCODE='22023'; END IF;
    RETURN prior.group_id;
  END IF;
  SELECT * INTO cfg FROM public.haroolife_pilot WHERE singleton FOR SHARE;
  IF NOT cfg.enabled THEN RAISE EXCEPTION 'Pilote indisponible' USING ERRCODE='55000'; END IF;
  IF p_action='create' THEN
    IF coalesce(p_payload->>'kind','') NOT IN ('team','work') OR coalesce(length(trim(p_payload->>'title')),0) NOT BETWEEN 3 AND 100
      OR coalesce(p_payload->>'activity','') NOT IN ('recolte','semis','desherbage')
      OR (p_payload->>'starts_on') IS NULL OR (p_payload->>'ends_on') IS NULL THEN
      RAISE EXCEPTION 'Informations du groupe invalides' USING ERRCODE='22023';
    END IF;
    IF (p_payload->>'starts_on')::date<=current_date OR (p_payload->>'ends_on')::date<(p_payload->>'starts_on')::date THEN
      RAISE EXCEPTION 'Choisissez une période à partir de demain' USING ERRCODE='22023';
    END IF;
    INSERT INTO public.haroolife_groups(owner_id,kind,title,activity,cooperative_id,canton_id,starts_on,ends_on,target,expires_at)
      VALUES(actor,p_payload->>'kind',trim(p_payload->>'title'),p_payload->>'activity',cfg.cooperative_id,cfg.canton_id,
        (p_payload->>'starts_on')::date,(p_payload->>'ends_on')::date,
        CASE WHEN p_payload->>'kind'='team' THEN cfg.team_target ELSE cfg.area_target END,
        least(now()+make_interval(hours=>cfg.formation_hours),((p_payload->>'starts_on')::date::timestamp AT TIME ZONE 'UTC')))
      RETURNING * INTO g;
  ELSE
    SELECT * INTO g FROM public.haroolife_groups WHERE id=(p_payload->>'group_id')::uuid FOR UPDATE;
    IF NOT FOUND OR g.cooperative_id<>cfg.cooperative_id OR g.canton_id<>cfg.canton_id THEN
      RAISE EXCEPTION 'Groupe inaccessible' USING ERRCODE='42501';
    END IF;
  END IF;
  IF g.cancelled_at IS NOT NULL OR g.expires_at<=now() THEN RAISE EXCEPTION 'Ce groupe est fermé' USING ERRCODE='22023'; END IF;

  IF p_action IN ('create','join') THEN
    SELECT coalesce(sum(amount),0) INTO total FROM public.haroolife_participations WHERE group_id=g.id AND left_at IS NULL;
    IF total>=g.target THEN RAISE EXCEPTION 'Le groupe est déjà complet' USING ERRCODE='22023'; END IF;
    IF EXISTS(SELECT 1 FROM public.haroolife_participations WHERE group_id=g.id AND user_id=actor AND left_at IS NULL) THEN
      RAISE EXCEPTION 'Vous participez déjà à ce groupe' USING ERRCODE='22023';
    END IF;
    IF g.kind='team' THEN
      IF NOT (access->>'can_team')::boolean THEN RAISE EXCEPTION 'Profil ouvrier disponible dans ce canton requis' USING ERRCODE='42501'; END IF;
      IF EXISTS(SELECT 1 FROM public.haroolife_participations x JOIN public.haroolife_groups other ON other.id=x.group_id
        WHERE x.user_id=actor AND x.left_at IS NULL AND other.kind='team' AND other.cancelled_at IS NULL AND other.expires_at>now()
          AND other.starts_on<=g.ends_on AND other.ends_on>=g.starts_on) THEN
        RAISE EXCEPTION 'Vous avez déjà une équipe sur cette période' USING ERRCODE='22023';
      END IF;
      contribution:=1;
    ELSE
      IF NOT (access->>'can_work')::boolean THEN RAISE EXCEPTION 'Une parcelle personnelle du pilote est requise' USING ERRCODE='42501'; END IF;
      parcel_id:=(p_payload->>'parcel_id')::uuid;
      SELECT * INTO parcel FROM public.parcelles WHERE id=parcel_id FOR UPDATE;
      IF NOT FOUND OR parcel.cooperative_id<>cfg.cooperative_id OR NOT EXISTS(
        SELECT 1 FROM public.members m WHERE m.id=parcel.member_id AND m.cooperative_id=cfg.cooperative_id AND private.owns_member(m.cooperative_id,m.email)
      ) THEN RAISE EXCEPTION 'Parcelle inaccessible' USING ERRCODE='42501'; END IF;
      contribution:=(p_payload->>'amount')::numeric;
      IF contribution IS NULL OR contribution::text IN ('NaN','Infinity','-Infinity') OR contribution<=0 OR parcel.superficie_ha IS NULL
        OR contribution>parcel.superficie_ha OR contribution<>round(contribution,4) THEN
        RAISE EXCEPTION 'Surface supérieure à la parcelle ou invalide' USING ERRCODE='22023';
      END IF;
      IF total+contribution>cfg.area_max THEN
        RAISE EXCEPTION 'Cette surface dépasserait le maximum du regroupement (% ha)',cfg.area_max USING ERRCODE='22023';
      END IF;
      IF EXISTS(SELECT 1 FROM public.haroolife_participations x JOIN public.haroolife_groups other ON other.id=x.group_id
        WHERE x.parcel_id=parcel.id AND x.left_at IS NULL AND other.cancelled_at IS NULL AND other.expires_at>now()
          AND other.starts_on<=g.ends_on AND other.ends_on>=g.starts_on) THEN
        RAISE EXCEPTION 'Cette parcelle participe déjà sur cette période' USING ERRCODE='22023';
      END IF;
    END IF;
    INSERT INTO public.haroolife_participations(group_id,user_id,parcel_id,amount)
      VALUES(g.id,actor,parcel_id,contribution)
      ON CONFLICT(group_id,user_id) DO UPDATE SET parcel_id=excluded.parcel_id,amount=excluded.amount,left_at=NULL,joined_at=now();
  ELSIF p_action='leave' THEN
    IF g.owner_id=actor THEN RAISE EXCEPTION 'Le créateur doit annuler le groupe' USING ERRCODE='22023'; END IF;
    UPDATE public.haroolife_participations SET left_at=now() WHERE group_id=g.id AND user_id=actor AND left_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vous ne participez pas à ce groupe' USING ERRCODE='22023'; END IF;
  ELSE
    IF g.owner_id<>actor THEN RAISE EXCEPTION 'Seul le créateur peut annuler' USING ERRCODE='42501'; END IF;
    UPDATE public.haroolife_groups SET cancelled_at=now() WHERE id=g.id;
  END IF;
  INSERT INTO public.haroolife_events(user_id,request_id,action,payload,group_id) VALUES(actor,p_request_id,p_action,p_payload,g.id);
  RETURN g.id;
END $$;
REVOKE ALL ON FUNCTION public.haroolife_command(text,uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.haroolife_command(text,uuid,jsonb) TO authenticated;
