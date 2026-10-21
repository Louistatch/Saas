-- HarooLife : recruter un ouvrier pour « Mon champ » (argent du jeu, jamais d'argent réel).
--   - haroolife_field_workers(région) : les vrais ouvriers Haroo disponibles (prénom, trois
--     compétences, note), ceux de la région d'abord ; jamais un nom de famille ni un téléphone ;
--   - haroolife_field_offer(ouvrier, jours, culture, ville) : le joueur propose 1 à 3 jours
--     d'entretien, 1 500 FCFA du jeu par jour ; une proposition en attente à la fois, 10 par 24 h,
--     et le solde de la partie en ligne doit couvrir la paie ;
--   - haroolife_field_answer(proposition, accepte) : l'ouvrier répond (dans le jeu ou sur son
--     tableau de bord). S'il accepte, la paie part par le transfert d'argent du jeu existant
--     (haroolife_money_transfers, encaissé par haroolife_money_claim), une seule fois ;
--   - haroolife_field_offers_mine() : ce que le joueur a proposé, ce qu'on propose à l'ouvrier ;
--   - haroolife_field_seen / haroolife_field_cancel : le joueur a pris acte de la réponse, ou
--     retire sa proposition.
-- Une proposition sans réponse expire au bout de 24 h. Rien n'engage personne hors du jeu.
-- Dépend de 20261015_150000_haroolife_money.sql et 20261016_120000_haroolife_saves.sql.
-- Additif : aucune table, ligne ni fonction existante n'est modifiée.
-- Retour arrière : supabase/rollbacks/20261022_120000_haroolife_field_work.rollback.sql

CREATE TABLE public.haroolife_field_offers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  worker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  crop text NOT NULL CHECK (crop ~ '^[a-z]{2,12}$'),
  locality text NOT NULL CHECK (locality ~ '^[a-z]{2,12}$'),
  days smallint NOT NULL CHECK (days BETWEEN 1 AND 3),
  pay integer NOT NULL CHECK (pay BETWEEN 1 AND 50000),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired')),
  reason text CHECK (reason IS NULL OR length(reason) <= 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  answered_at timestamptz,
  employer_seen_at timestamptz,
  CHECK (employer_id <> worker_id)
);
-- Une seule proposition en attente par joueur.
CREATE UNIQUE INDEX haroolife_field_offers_one_pending
  ON public.haroolife_field_offers(employer_id) WHERE status = 'pending';
CREATE INDEX haroolife_field_offers_asked
  ON public.haroolife_field_offers(worker_id) WHERE status = 'pending';
CREATE INDEX haroolife_field_offers_hired
  ON public.haroolife_field_offers(employer_id, created_at DESC);
ALTER TABLE public.haroolife_field_offers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_field_offers FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_field_offers TO service_role;

-- Le nom de jeu d'un joueur : son nom d'utilisateur, sinon son nom d'habitant.
CREATE OR REPLACE FUNCTION private.haroolife_field_player(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT '@' || u.username FROM public.haroolife_usernames u WHERE u.user_id = p_user),
    (SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = p_user),
    'Un joueur')
$$;

-- Le prénom d'un ouvrier, tel qu'on se présente au champ (« KOMLA Ama » → « Komla »).
CREATE OR REPLACE FUNCTION private.haroolife_field_first_name(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT initcap(split_part(trim(o.first_name), ' ', 1))
       FROM public.haroo_ouvrier_profiles o WHERE o.user_id = p_user),
    'Ouvrier')
$$;

CREATE OR REPLACE FUNCTION private.haroolife_field_json(o public.haroolife_field_offers)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', o.id,
    'status', CASE WHEN o.status = 'pending' AND o.expires_at <= now() THEN 'expired' ELSE o.status END,
    'reason', o.reason,
    'days', o.days, 'pay', o.pay, 'crop', o.crop, 'locality', o.locality,
    'created_at', o.created_at, 'expires_at', o.expires_at, 'answered_at', o.answered_at,
    'seen', o.employer_seen_at IS NOT NULL,
    'worker', private.haroolife_field_first_name(o.worker_id),
    'employer', private.haroolife_field_player(o.employer_id))
$$;

-- Les propositions restées sans réponse 24 h sont closes (à la lecture, sans tâche planifiée).
CREATE OR REPLACE FUNCTION private.haroolife_field_expire(p_user uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  UPDATE public.haroolife_field_offers SET status = 'expired', answered_at = now()
  WHERE status = 'pending' AND expires_at <= now() AND (employer_id = p_user OR worker_id = p_user)
$$;

CREATE OR REPLACE FUNCTION public.haroolife_field_workers(p_region text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); out jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ref', x.id, 'name', x.name, 'skills', x.skills, 'note', x.note, 'reviews', x.reviews,
    'nearby', x.nearby) ORDER BY x.nearby DESC, x.note DESC, x.name), '[]'::jsonb)
  INTO out
  FROM (
    SELECT o.id, initcap(split_part(trim(o.first_name), ' ', 1)) AS name,
           o.competences[1:3] AS skills, round(o.note_moyenne, 1) AS note, o.nombre_avis AS reviews,
           EXISTS (
             SELECT 1 FROM public.haroo_ouvrier_cantons oc
             JOIN public.cantons c ON c.id = oc.canton_id
             JOIN public.prefectures pf ON pf.id = c.prefecture_id
             JOIN public.regions r ON r.id = pf.region_id
             WHERE oc.ouvrier_id = o.id AND lower(r.name) = lower(coalesce(p_region, ''))
           ) AS nearby
    FROM public.haroo_ouvrier_profiles o
    JOIN public.profiles pr ON pr.id = o.user_id
    WHERE o.disponible AND o.user_id <> actor AND pr.deleted_at IS NULL
      AND pr.haroo_type::text = 'ouvrier'
    ORDER BY nearby DESC, o.note_moyenne DESC, o.id
    LIMIT 8
  ) x;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_field_offer(
  p_worker uuid, p_days integer, p_crop text, p_locality text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); worker uuid; recent integer; known bigint; v_pay integer;
        o public.haroolife_field_offers;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_days IS NULL OR p_days NOT BETWEEN 1 AND 3 THEN
    RAISE EXCEPTION 'Entre 1 et 3 jours de travail' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_crop, '') !~ '^[a-z]{2,12}$' OR coalesce(p_locality, '') !~ '^[a-z]{2,12}$' THEN
    RAISE EXCEPTION 'Champ invalide' USING ERRCODE = '22023';
  END IF;
  SELECT op.user_id INTO worker FROM public.haroo_ouvrier_profiles op
    JOIN public.profiles pr ON pr.id = op.user_id
    WHERE op.id = p_worker AND op.disponible AND pr.deleted_at IS NULL
      AND pr.haroo_type::text = 'ouvrier';
  IF worker IS NULL OR worker = actor THEN
    RAISE EXCEPTION 'Cet ouvrier n’est plus disponible' USING ERRCODE = '42501';
  END IF;
  PERFORM private.haroolife_field_expire(actor);
  IF EXISTS (SELECT 1 FROM public.haroolife_field_offers WHERE employer_id = actor AND status = 'pending') THEN
    RAISE EXCEPTION 'Une proposition attend déjà sa réponse' USING ERRCODE = '22023';
  END IF;
  SELECT count(*) INTO recent FROM public.haroolife_field_offers
    WHERE employer_id = actor AND created_at > now() - interval '24 hours';
  IF recent >= 10 THEN
    RAISE EXCEPTION 'Assez de propositions pour aujourd’hui : réessaie demain' USING ERRCODE = '22023';
  END IF;
  v_pay := p_days * 1500;
  known := private.haroolife_known_wallet(actor);
  IF known IS NULL THEN
    RAISE EXCEPTION 'Ta partie n’est pas encore sauvegardée en ligne : réessaie dans un instant' USING ERRCODE = '22023';
  END IF;
  IF known < v_pay THEN
    RAISE EXCEPTION 'Solde insuffisant pour payer l’ouvrier' USING ERRCODE = '22023';
  END IF;
  BEGIN
    INSERT INTO public.haroolife_field_offers(employer_id, worker_id, crop, locality, days, pay)
    VALUES (actor, worker, p_crop, p_locality, p_days, v_pay) RETURNING * INTO o;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'Une proposition attend déjà sa réponse' USING ERRCODE = '22023';
  END;
  RETURN private.haroolife_field_json(o);
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_field_offers_mine()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); hired jsonb; asked jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  PERFORM private.haroolife_field_expire(actor);
  SELECT coalesce(jsonb_agg(private.haroolife_field_json(o) ORDER BY o.created_at DESC), '[]'::jsonb)
    INTO hired
    FROM (SELECT * FROM public.haroolife_field_offers
          WHERE employer_id = actor AND created_at > now() - interval '7 days'
          ORDER BY created_at DESC LIMIT 10) o;
  SELECT coalesce(jsonb_agg(private.haroolife_field_json(o) ORDER BY o.created_at), '[]'::jsonb)
    INTO asked
    FROM (SELECT * FROM public.haroolife_field_offers
          WHERE worker_id = actor AND status = 'pending'
          ORDER BY created_at LIMIT 20) o;
  RETURN jsonb_build_object('hired', hired, 'asked', asked);
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_field_answer(p_offer uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); o public.haroolife_field_offers; known bigint;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO o FROM public.haroolife_field_offers WHERE id = p_offer FOR UPDATE;
  IF NOT FOUND OR o.worker_id <> actor THEN
    RAISE EXCEPTION 'Proposition introuvable' USING ERRCODE = '42501';
  END IF;
  -- La même réponse rejouée (double toucher, réseau) rend la proposition telle quelle.
  IF o.status = 'accepted' AND p_accept OR o.status = 'declined' AND NOT p_accept THEN
    RETURN private.haroolife_field_json(o);
  END IF;
  IF o.status <> 'pending' THEN
    RAISE EXCEPTION 'Cette proposition n’attend plus de réponse' USING ERRCODE = '22023';
  END IF;
  IF o.expires_at <= now() THEN
    UPDATE public.haroolife_field_offers SET status = 'expired', answered_at = now()
      WHERE id = o.id RETURNING * INTO o;
    RETURN private.haroolife_field_json(o);
  END IF;
  IF NOT p_accept THEN
    UPDATE public.haroolife_field_offers SET status = 'declined', answered_at = now()
      WHERE id = o.id RETURNING * INTO o;
    RETURN private.haroolife_field_json(o);
  END IF;
  -- Le joueur doit encore pouvoir payer (solde de sa partie en ligne, verrouillée).
  PERFORM 1 FROM public.haroolife_saves WHERE user_id = o.employer_id FOR UPDATE;
  known := private.haroolife_known_wallet(o.employer_id);
  IF known IS NULL OR known < o.pay THEN
    UPDATE public.haroolife_field_offers
      SET status = 'cancelled', reason = 'Le joueur n’a plus de quoi payer', answered_at = now()
      WHERE id = o.id RETURNING * INTO o;
    RETURN private.haroolife_field_json(o);
  END IF;
  INSERT INTO public.haroolife_money_transfers(sender_id, recipient_id, amount, note, client_id)
  VALUES (o.employer_id, o.worker_id, o.pay, 'Travail au champ', o.id)
  ON CONFLICT (sender_id, client_id) DO NOTHING;
  UPDATE public.haroolife_field_offers SET status = 'accepted', answered_at = now()
    WHERE id = o.id RETURNING * INTO o;
  RETURN private.haroolife_field_json(o);
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_field_seen(p_offer uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  UPDATE public.haroolife_field_offers SET employer_seen_at = now()
    WHERE id = p_offer AND employer_id = actor AND status <> 'pending' AND employer_seen_at IS NULL;
  RETURN FOUND;
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_field_cancel(p_offer uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); o public.haroolife_field_offers;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  UPDATE public.haroolife_field_offers
    SET status = 'cancelled', reason = 'Retirée par le joueur', answered_at = now(), employer_seen_at = now()
    WHERE id = p_offer AND employer_id = actor AND status = 'pending'
    RETURNING * INTO o;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Proposition introuvable ou déjà répondue' USING ERRCODE = '22023';
  END IF;
  RETURN private.haroolife_field_json(o);
END $$;

REVOKE ALL ON FUNCTION private.haroolife_field_player(uuid), private.haroolife_field_first_name(uuid),
  private.haroolife_field_json(public.haroolife_field_offers), private.haroolife_field_expire(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_field_workers(text),
  public.haroolife_field_offer(uuid, integer, text, text), public.haroolife_field_offers_mine(),
  public.haroolife_field_answer(uuid, boolean), public.haroolife_field_seen(uuid),
  public.haroolife_field_cancel(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_field_workers(text),
  public.haroolife_field_offer(uuid, integer, text, text), public.haroolife_field_offers_mine(),
  public.haroolife_field_answer(uuid, boolean), public.haroolife_field_seen(uuid),
  public.haroolife_field_cancel(uuid) TO authenticated;
