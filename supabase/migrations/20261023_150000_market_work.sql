-- Marché de proximité et travail agricole : répondre à une annonce, inviter un ouvrier, retenir.
--   - producer_announcements : offre de travail (salaire par jour, postes, début, durée),
--     expiration par défaut (45 jours), deux colonnes calculées lisibles de tous
--     (has_contact, accepts_responses) ;
--   - market_responses : une réponse (« je suis intéressé / disponible ») ou une invitation
--     d'ouvrier par annonce et par personne. Fermée aux rôles API : tout passe par les
--     fonctions market_* ci-dessous ;
--   - les numéros ne s'échangent qu'une fois la réponse retenue ou l'invitation acceptée.
-- Additif : aucune ligne existante n'est modifiée ni supprimée ; les politiques et droits
-- existants restent en place. La fermeture du téléphone au rôle anonyme est à part
-- (20261023_150100_market_anon_phone.sql), à appliquer après le déploiement du code.
-- Retour arrière : supabase/rollbacks/20261023_150000_market_work.rollback.sql

-- ── Annonces ─────────────────────────────────────────────────────────────────
ALTER TABLE public.producer_announcements
  ADD COLUMN wage_per_day_fcfa integer
    CHECK (wage_per_day_fcfa IS NULL OR wage_per_day_fcfa BETWEEN 100 AND 100000),
  ADD COLUMN positions smallint CHECK (positions IS NULL OR positions BETWEEN 1 AND 200),
  ADD COLUMN starts_on date,
  ADD COLUMN work_days smallint CHECK (work_days IS NULL OR work_days BETWEEN 1 AND 120),
  ADD COLUMN has_contact boolean
    GENERATED ALWAYS AS (coalesce(length(trim(contact_phone)), 0) > 0) STORED,
  ADD COLUMN accepts_responses boolean GENERATED ALWAYS AS (author_id IS NOT NULL) STORED;

ALTER TABLE public.producer_announcements
  ALTER COLUMN expires_at SET DEFAULT now() + interval '45 days';

CREATE INDEX IF NOT EXISTS producer_announcements_open_recent
  ON public.producer_announcements (type, created_at DESC) WHERE status = 'active';

-- ── Réponses et invitations ──────────────────────────────────────────────────
CREATE TABLE public.market_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES public.producer_announcements(id) ON DELETE CASCADE,
  responder_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- 'reponse' : le répondant a écrit ; 'invitation' : l'auteur de l'offre l'a invité.
  origin text NOT NULL CHECK (origin IN ('reponse', 'invitation')),
  status text NOT NULL CHECK (status IN ('envoyee', 'invitee', 'retenue', 'declinee', 'retiree')),
  message text CHECK (message IS NULL OR length(message) <= 280),
  quantity_kg numeric CHECK (quantity_kg IS NULL OR (quantity_kg > 0 AND quantity_kg <= 10000000)),
  contact_phone text CHECK (contact_phone IS NULL OR contact_phone ~ '^\+[0-9]{8,15}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  -- Nouvelles non lues de chaque côté (une décision, une invitation acceptée…).
  author_seen_at timestamptz,
  responder_seen_at timestamptz,
  UNIQUE (announcement_id, responder_id)
);
CREATE INDEX market_responses_responder ON public.market_responses (responder_id, created_at DESC);
ALTER TABLE public.market_responses ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.market_responses FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.market_responses TO service_role;

-- ── Outils privés ────────────────────────────────────────────────────────────

-- Numéro au format +228XXXXXXXX ; un numéro local à 8 chiffres reçoit l'indicatif du Togo.
CREATE OR REPLACE FUNCTION private.market_phone(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
DECLARE d text := regexp_replace(coalesce(p, ''), '[^0-9+]', '', 'g');
BEGIN
  IF d = '' THEN RETURN NULL; END IF;
  IF left(d, 1) = '+' THEN
    d := '+' || regexp_replace(substr(d, 2), '[^0-9]', '', 'g');
  ELSIF left(d, 2) = '00' THEN
    d := '+' || substr(d, 3);
  ELSIF length(d) = 8 THEN
    d := '+228' || d;
  ELSE
    d := '+' || d;
  END IF;
  IF d !~ '^\+[0-9]{8,15}$' THEN
    RAISE EXCEPTION 'Numéro de téléphone invalide' USING ERRCODE = '22023';
  END IF;
  RETURN d;
END $$;

-- Pour l'affichage : le numéro normalisé, ou tel quel s'il ne se normalise pas.
CREATE OR REPLACE FUNCTION private.market_phone_shown(p text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = '' AS $$
BEGIN
  RETURN private.market_phone(p);
EXCEPTION WHEN OTHERS THEN
  RETURN nullif(trim(coalesce(p, '')), '');
END $$;

-- Le numéro du profil Haroo du compte, s'il est exploitable.
CREATE OR REPLACE FUNCTION private.market_own_phone(p_user uuid)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE raw text;
BEGIN
  SELECT coalesce(
    (SELECT o.phone FROM public.haroo_ouvrier_profiles o WHERE o.user_id = p_user),
    (SELECT a.phone FROM public.haroo_acheteur_profiles a WHERE a.user_id = p_user),
    (SELECT g.phone FROM public.haroo_agronome_profiles g WHERE g.user_id = p_user))
  INTO raw;
  RETURN private.market_phone(raw);
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END $$;

-- Ce que l'on montre d'une personne : prénom et initiale, profil Haroo, compétences et note
-- d'un ouvrier, son premier canton. Jamais le nom de famille, le téléphone ni l'identifiant.
CREATE OR REPLACE FUNCTION private.market_person(p_user uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'name', coalesce(nullif(trim(
      initcap(split_part(trim(coalesce(nullif(trim(pr.first_name), ''), o.first_name, a.first_name,
        g.first_name, '')), ' ', 1)) || ' ' ||
      coalesce(upper(left(nullif(trim(coalesce(nullif(trim(pr.last_name), ''), o.last_name,
        a.last_name, g.last_name)), ''), 1)) || '.', '')), ''), 'Un utilisateur'),
    'kind', CASE pr.haroo_type::text
      WHEN 'ouvrier' THEN 'ouvrier' WHEN 'acheteur' THEN 'acheteur'
      WHEN 'agronome' THEN 'agronome' ELSE 'membre' END,
    'skills', CASE WHEN pr.haroo_type::text = 'ouvrier'
      THEN to_jsonb(coalesce(o.competences[1:4], '{}'::text[])) ELSE '[]'::jsonb END,
    'note', CASE WHEN pr.haroo_type::text = 'ouvrier' AND o.nombre_avis > 0
      THEN round(o.note_moyenne, 1) END,
    'reviews', CASE WHEN pr.haroo_type::text = 'ouvrier' THEN coalesce(o.nombre_avis, 0) ELSE 0 END,
    'place', (SELECT c.name FROM public.haroo_ouvrier_cantons oc
              JOIN public.cantons c ON c.id = oc.canton_id
              WHERE oc.ouvrier_id = o.id ORDER BY c.name LIMIT 1))
  FROM public.profiles pr
  LEFT JOIN public.haroo_ouvrier_profiles o ON o.user_id = pr.id
  LEFT JOIN public.haroo_acheteur_profiles a ON a.user_id = pr.id
  LEFT JOIN public.haroo_agronome_profiles g ON g.user_id = pr.id
  WHERE pr.id = p_user
$$;

CREATE OR REPLACE FUNCTION private.market_open(a public.producer_announcements)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT a.status = 'active' AND (a.expires_at IS NULL OR a.expires_at > now())
$$;

CREATE OR REPLACE FUNCTION private.market_announcement_json(a public.producer_announcements)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', a.id, 'type', a.type, 'title', a.title, 'status', a.status,
    'open', private.market_open(a), 'created_at', a.created_at, 'expires_at', a.expires_at,
    'culture', a.culture, 'quantity_kg', a.quantity_kg, 'price_per_kg_fcfa', a.price_per_kg_fcfa,
    'wage_per_day_fcfa', a.wage_per_day_fcfa, 'positions', a.positions, 'starts_on', a.starts_on,
    'work_days', a.work_days, 'has_contact', a.has_contact,
    'place', nullif(concat_ws(', ',
      coalesce((SELECT c.name FROM public.cantons c WHERE c.id = a.canton_id), a.location_canton),
      (SELECT p.name FROM public.prefectures p WHERE p.id = a.prefecture_id)), ''))
$$;

-- Une réponse vue par l'auteur de l'annonce : le téléphone seulement une fois retenue.
CREATE OR REPLACE FUNCTION private.market_for_author(r public.market_responses)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'status', r.status, 'origin', r.origin, 'message', r.message,
    'quantity_kg', r.quantity_kg, 'created_at', r.created_at, 'decided_at', r.decided_at,
    'unseen', r.author_seen_at IS NULL,
    'person', private.market_person(r.responder_id),
    'phone', CASE WHEN r.status = 'retenue' THEN r.contact_phone END)
$$;

-- La même vue par le répondant : l'annonce, son auteur, et le numéro de l'auteur une fois
-- retenu.
CREATE OR REPLACE FUNCTION private.market_for_responder(r public.market_responses)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', r.id, 'status', r.status, 'origin', r.origin, 'message', r.message,
    'quantity_kg', r.quantity_kg, 'created_at', r.created_at, 'decided_at', r.decided_at,
    'unseen', r.responder_seen_at IS NULL,
    'announcement', private.market_announcement_json(a),
    'author', private.market_person(a.author_id),
    'phone', CASE WHEN r.status = 'retenue' THEN private.market_phone_shown(a.contact_phone) END)
  FROM public.producer_announcements a WHERE a.id = r.announcement_id
$$;

-- Décisions à prendre et nouvelles non lues du compte.
CREATE OR REPLACE FUNCTION private.market_unread(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT (
    SELECT count(*) FROM public.market_responses r
    JOIN public.producer_announcements a ON a.id = r.announcement_id
    WHERE a.author_id = p_user
      AND ((r.status = 'envoyee' AND private.market_open(a))
        OR (r.author_seen_at IS NULL AND r.status <> 'envoyee'))
  )::integer + (
    SELECT count(*) FROM public.market_responses r
    JOIN public.producer_announcements a ON a.id = r.announcement_id
    WHERE r.responder_id = p_user
      AND ((r.status = 'invitee' AND private.market_open(a))
        OR (r.responder_seen_at IS NULL AND r.status <> 'invitee'))
  )::integer
$$;

-- ── Fonctions appelées par l'application ─────────────────────────────────────

-- « Je suis intéressé / disponible » : une réponse par annonce, rejouable sans effet.
CREATE OR REPLACE FUNCTION public.market_respond(
  p_announcement uuid, p_message text DEFAULT NULL, p_quantity_kg numeric DEFAULT NULL,
  p_phone text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); a public.producer_announcements;
        r public.market_responses; v_phone text; recent integer;
        v_msg text := nullif(trim(coalesce(p_message, '')), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.producer_announcements WHERE id = p_announcement;
  IF NOT FOUND OR NOT private.market_open(a) THEN
    RAISE EXCEPTION 'Cette annonce n’est plus ouverte' USING ERRCODE = '22023';
  END IF;
  IF a.author_id IS NULL THEN
    RAISE EXCEPTION 'Cette annonce se règle par téléphone' USING ERRCODE = '22023';
  END IF;
  IF a.author_id = actor THEN
    RAISE EXCEPTION 'C’est votre annonce' USING ERRCODE = '22023';
  END IF;
  IF v_msg IS NOT NULL AND length(v_msg) > 280 THEN
    RAISE EXCEPTION 'Message trop long (280 caractères au plus)' USING ERRCODE = '22023';
  END IF;
  IF p_quantity_kg IS NOT NULL AND (p_quantity_kg <= 0 OR p_quantity_kg > 10000000) THEN
    RAISE EXCEPTION 'Quantité invalide' USING ERRCODE = '22023';
  END IF;
  v_phone := coalesce(private.market_phone(p_phone), private.market_own_phone(actor));
  IF v_phone IS NULL THEN
    RAISE EXCEPTION 'Indiquez un numéro pour être rappelé' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.market_responses
    WHERE announcement_id = a.id AND responder_id = actor FOR UPDATE;
  IF FOUND THEN
    IF r.status IN ('envoyee', 'retenue') THEN RETURN private.market_for_responder(r); END IF;
    IF r.status = 'invitee' THEN
      RAISE EXCEPTION 'Vous êtes invité sur cette offre : acceptez l’invitation dans votre suivi'
        USING ERRCODE = '22023';
    END IF;
    IF r.status = 'declinee' THEN
      RAISE EXCEPTION 'L’auteur a déjà décliné votre réponse' USING ERRCODE = '22023';
    END IF;
    -- Retirée : on peut se représenter.
    UPDATE public.market_responses
      SET origin = 'reponse', status = 'envoyee', message = v_msg, quantity_kg = p_quantity_kg,
          contact_phone = v_phone, created_at = now(), decided_at = NULL,
          author_seen_at = NULL, responder_seen_at = now()
      WHERE id = r.id RETURNING * INTO r;
    RETURN private.market_for_responder(r);
  END IF;

  SELECT count(*) INTO recent FROM public.market_responses
    WHERE responder_id = actor AND origin = 'reponse' AND created_at > now() - interval '24 hours';
  IF recent >= 20 THEN
    RAISE EXCEPTION 'Assez de réponses pour aujourd’hui : réessayez demain' USING ERRCODE = '22023';
  END IF;
  BEGIN
    INSERT INTO public.market_responses(
      announcement_id, responder_id, origin, status, message, quantity_kg, contact_phone,
      responder_seen_at)
    VALUES (a.id, actor, 'reponse', 'envoyee', v_msg, p_quantity_kg, v_phone, now())
    RETURNING * INTO r;
  EXCEPTION WHEN unique_violation THEN
    SELECT * INTO r FROM public.market_responses WHERE announcement_id = a.id AND responder_id = actor;
  END;
  RETURN private.market_for_responder(r);
END $$;

-- L'auteur d'une offre de travail invite un ouvrier disponible.
CREATE OR REPLACE FUNCTION public.market_invite(
  p_announcement uuid, p_worker uuid, p_message text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); a public.producer_announcements;
        r public.market_responses; worker uuid; recent integer; existing boolean;
        v_msg text := nullif(trim(coalesce(p_message, '')), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO a FROM public.producer_announcements WHERE id = p_announcement;
  IF NOT FOUND OR a.author_id IS DISTINCT FROM actor THEN
    RAISE EXCEPTION 'Seul l’auteur de l’offre peut inviter' USING ERRCODE = '42501';
  END IF;
  IF a.type <> 'job' THEN
    RAISE EXCEPTION 'On invite un ouvrier sur une offre de travail' USING ERRCODE = '22023';
  END IF;
  IF NOT private.market_open(a) THEN
    RAISE EXCEPTION 'Cette offre n’est plus ouverte' USING ERRCODE = '22023';
  END IF;
  IF v_msg IS NOT NULL AND length(v_msg) > 280 THEN
    RAISE EXCEPTION 'Message trop long (280 caractères au plus)' USING ERRCODE = '22023';
  END IF;
  SELECT op.user_id INTO worker FROM public.haroo_ouvrier_profiles op
    JOIN public.profiles pr ON pr.id = op.user_id
    WHERE op.id = p_worker AND op.disponible AND pr.deleted_at IS NULL
      AND pr.haroo_type::text = 'ouvrier';
  IF worker IS NULL OR worker = actor THEN
    RAISE EXCEPTION 'Cet ouvrier n’est plus disponible' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO r FROM public.market_responses
    WHERE announcement_id = a.id AND responder_id = worker FOR UPDATE;
  existing := FOUND;
  IF existing THEN
    IF r.status IN ('envoyee', 'invitee', 'retenue') THEN RETURN private.market_for_author(r); END IF;
    IF r.status = 'declinee' THEN
      RAISE EXCEPTION 'Cet ouvrier a déjà répondu à cette offre' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT count(*) INTO recent FROM public.market_responses r2
    JOIN public.producer_announcements a2 ON a2.id = r2.announcement_id
    WHERE a2.author_id = actor AND r2.origin = 'invitation'
      AND r2.created_at > now() - interval '24 hours';
  IF recent >= 30 THEN
    RAISE EXCEPTION 'Assez d’invitations pour aujourd’hui : réessayez demain' USING ERRCODE = '22023';
  END IF;

  IF existing THEN
    UPDATE public.market_responses
      SET origin = 'invitation', status = 'invitee', message = v_msg, quantity_kg = NULL,
          contact_phone = NULL, created_at = now(), decided_at = NULL,
          author_seen_at = now(), responder_seen_at = NULL
      WHERE id = r.id RETURNING * INTO r;
  ELSE
    BEGIN
      INSERT INTO public.market_responses(
        announcement_id, responder_id, origin, status, message, author_seen_at)
      VALUES (a.id, worker, 'invitation', 'invitee', v_msg, now())
      RETURNING * INTO r;
    EXCEPTION WHEN unique_violation THEN
      SELECT * INTO r FROM public.market_responses WHERE announcement_id = a.id AND responder_id = worker;
    END;
  END IF;
  RETURN private.market_for_author(r);
END $$;

-- Retenir ou décliner : l'auteur pour une réponse, l'ouvrier pour une invitation.
CREATE OR REPLACE FUNCTION public.market_decide(p_response uuid, p_accept boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); a public.producer_announcements;
        r public.market_responses; v_phone text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_accept IS NULL THEN RAISE EXCEPTION 'Décision manquante' USING ERRCODE = '22023'; END IF;
  SELECT * INTO r FROM public.market_responses WHERE id = p_response FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO a FROM public.producer_announcements WHERE id = r.announcement_id;
  END IF;
  IF NOT FOUND OR (actor IS DISTINCT FROM a.author_id AND actor IS DISTINCT FROM r.responder_id) THEN
    RAISE EXCEPTION 'Réponse introuvable' USING ERRCODE = '42501';
  END IF;

  -- La même décision rejouée (double toucher, réseau) rend la réponse telle quelle.
  IF (r.status = 'retenue' AND p_accept) OR (r.status = 'declinee' AND NOT p_accept) THEN
    RETURN CASE WHEN actor IS NOT DISTINCT FROM a.author_id THEN private.market_for_author(r)
                ELSE private.market_for_responder(r) END;
  END IF;
  IF NOT (r.status = 'envoyee' AND actor = a.author_id)
     AND NOT (r.status = 'invitee' AND actor = r.responder_id) THEN
    RAISE EXCEPTION 'Cette réponse n’attend pas votre décision' USING ERRCODE = '22023';
  END IF;
  IF NOT private.market_open(a) THEN
    RAISE EXCEPTION 'Cette annonce est close' USING ERRCODE = '22023';
  END IF;

  IF r.status = 'envoyee' THEN
    UPDATE public.market_responses
      SET status = CASE WHEN p_accept THEN 'retenue' ELSE 'declinee' END, decided_at = now(),
          author_seen_at = now(), responder_seen_at = NULL
      WHERE id = r.id RETURNING * INTO r;
    RETURN private.market_for_author(r);
  END IF;

  -- Invitation : l'ouvrier qui accepte laisse son numéro à l'auteur.
  IF p_accept THEN
    v_phone := private.market_own_phone(actor);
    IF v_phone IS NULL THEN
      RAISE EXCEPTION 'Ajoutez votre numéro à votre profil pour être rappelé' USING ERRCODE = '22023';
    END IF;
  END IF;
  UPDATE public.market_responses
    SET status = CASE WHEN p_accept THEN 'retenue' ELSE 'declinee' END, decided_at = now(),
        contact_phone = coalesce(v_phone, contact_phone),
        author_seen_at = NULL, responder_seen_at = now()
    WHERE id = r.id RETURNING * INTO r;
  RETURN private.market_for_responder(r);
END $$;

-- Retirer ce que l'on a lancé : sa réponse (même retenue), ou son invitation sans réponse.
CREATE OR REPLACE FUNCTION public.market_withdraw(p_response uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); a public.producer_announcements;
        r public.market_responses;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO r FROM public.market_responses WHERE id = p_response FOR UPDATE;
  IF FOUND THEN
    SELECT * INTO a FROM public.producer_announcements WHERE id = r.announcement_id;
  END IF;
  IF NOT FOUND OR (actor IS DISTINCT FROM a.author_id AND actor IS DISTINCT FROM r.responder_id) THEN
    RAISE EXCEPTION 'Réponse introuvable' USING ERRCODE = '42501';
  END IF;
  IF r.status = 'retiree' THEN
    RETURN CASE WHEN actor IS NOT DISTINCT FROM a.author_id THEN private.market_for_author(r)
                ELSE private.market_for_responder(r) END;
  END IF;
  IF actor = r.responder_id AND r.origin = 'reponse' AND r.status IN ('envoyee', 'retenue') THEN
    UPDATE public.market_responses
      SET status = 'retiree', decided_at = now(), author_seen_at = NULL, responder_seen_at = now()
      WHERE id = r.id RETURNING * INTO r;
    RETURN private.market_for_responder(r);
  END IF;
  IF actor = a.author_id AND r.origin = 'invitation' AND r.status = 'invitee' THEN
    UPDATE public.market_responses
      SET status = 'retiree', decided_at = now(), author_seen_at = now(), responder_seen_at = now()
      WHERE id = r.id RETURNING * INTO r;
    RETURN private.market_for_author(r);
  END IF;
  RAISE EXCEPTION 'Impossible de retirer cette réponse' USING ERRCODE = '22023';
END $$;

-- L'auteur clôt son annonce (complet, vendu, annulé).
CREATE OR REPLACE FUNCTION public.market_close(p_announcement uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  UPDATE public.producer_announcements SET status = 'closed', updated_at = now()
    WHERE id = p_announcement AND author_id = actor AND status = 'active';
  IF FOUND THEN RETURN true; END IF;
  IF EXISTS (SELECT 1 FROM public.producer_announcements WHERE id = p_announcement AND author_id = actor) THEN
    RETURN false;
  END IF;
  RAISE EXCEPTION 'Annonce introuvable' USING ERRCODE = '42501';
END $$;

-- Tout le suivi du compte : ses annonces et leurs réponses, ses réponses et invitations.
CREATE OR REPLACE FUNCTION public.market_activity()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); mine jsonb; sent jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT coalesce(jsonb_agg(
    private.market_announcement_json(a) || jsonb_build_object(
      'hired', (SELECT count(*) FROM public.market_responses r
                WHERE r.announcement_id = a.id AND r.status = 'retenue'),
      'responses', (SELECT coalesce(jsonb_agg(private.market_for_author(r)
                      ORDER BY (r.status = 'envoyee') DESC, r.created_at DESC), '[]'::jsonb)
                    FROM public.market_responses r
                    WHERE r.announcement_id = a.id
                      AND NOT (r.origin = 'invitation' AND r.status = 'retiree')))
    ORDER BY a.created_at DESC), '[]'::jsonb)
  INTO mine
  FROM (SELECT * FROM public.producer_announcements
        WHERE author_id = actor AND created_at > now() - interval '180 days'
        ORDER BY created_at DESC LIMIT 30) a;

  SELECT coalesce(jsonb_agg(private.market_for_responder(r)
    ORDER BY (r.status = 'invitee') DESC, r.created_at DESC), '[]'::jsonb)
  INTO sent
  FROM (SELECT * FROM public.market_responses
        WHERE responder_id = actor AND NOT (origin = 'invitation' AND status = 'retiree')
          AND created_at > now() - interval '180 days'
        ORDER BY created_at DESC LIMIT 50) r;

  RETURN jsonb_build_object('announcements', mine, 'sent', sent,
                            'unread', private.market_unread(actor));
END $$;

CREATE OR REPLACE FUNCTION public.market_unread()
RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RETURN 0; END IF;
  RETURN private.market_unread(actor);
END $$;

-- Le compte a lu ses nouvelles (les décisions à prendre restent comptées).
CREATE OR REPLACE FUNCTION public.market_seen()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  UPDATE public.market_responses r SET author_seen_at = now()
    FROM public.producer_announcements a
    WHERE a.id = r.announcement_id AND a.author_id = actor AND r.author_seen_at IS NULL
      AND r.status <> 'envoyee';
  UPDATE public.market_responses SET responder_seen_at = now()
    WHERE responder_id = actor AND responder_seen_at IS NULL AND status <> 'invitee';
  RETURN private.market_unread(actor);
END $$;

-- Ouvriers disponibles, les plus proches d'abord (canton, préfecture, région). Comptes
-- connectés seulement ; jamais de nom de famille, de téléphone ni de compte de démonstration.
CREATE OR REPLACE FUNCTION public.market_workers(
  p_canton uuid DEFAULT NULL, p_prefecture uuid DEFAULT NULL, p_region uuid DEFAULT NULL,
  p_skill text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); v_pref uuid := p_prefecture; v_region uuid := p_region;
        v_skill text := nullif(lower(trim(coalesce(p_skill, ''))), ''); out jsonb;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_canton IS NOT NULL THEN
    SELECT c.prefecture_id INTO v_pref FROM public.cantons c WHERE c.id = p_canton;
  END IF;
  IF v_pref IS NOT NULL THEN
    SELECT p.region_id INTO v_region FROM public.prefectures p WHERE p.id = v_pref;
  END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ref', x.id, 'name', x.name, 'skills', x.skills, 'note', x.note, 'reviews', x.reviews,
    'cantons', x.cantons, 'proximity', x.rank) ORDER BY x.rank, x.note DESC NULLS LAST, x.name),
    '[]'::jsonb)
  INTO out
  FROM (
    SELECT o.id,
      coalesce(nullif(trim(initcap(split_part(trim(o.first_name), ' ', 1)) || ' ' ||
        coalesce(upper(left(nullif(trim(o.last_name), ''), 1)) || '.', '')), ''), 'Ouvrier') AS name,
      to_jsonb(coalesce(o.competences[1:6], '{}'::text[])) AS skills,
      CASE WHEN o.nombre_avis > 0 THEN round(o.note_moyenne, 1) END AS note,
      o.nombre_avis AS reviews,
      coalesce((SELECT jsonb_agg(z.name ORDER BY z.name) FROM (
        SELECT c.name FROM public.haroo_ouvrier_cantons oc JOIN public.cantons c ON c.id = oc.canton_id
        WHERE oc.ouvrier_id = o.id ORDER BY c.name LIMIT 3) z), '[]'::jsonb) AS cantons,
      coalesce((SELECT min(CASE WHEN c.id = p_canton THEN 0 WHEN c.prefecture_id = v_pref THEN 1
                                WHEN pf.region_id = v_region THEN 2 ELSE 3 END)
                FROM public.haroo_ouvrier_cantons oc
                JOIN public.cantons c ON c.id = oc.canton_id
                LEFT JOIN public.prefectures pf ON pf.id = c.prefecture_id
                WHERE oc.ouvrier_id = o.id), 3) AS rank
    FROM public.haroo_ouvrier_profiles o
    JOIN public.profiles pr ON pr.id = o.user_id
    WHERE o.disponible AND pr.deleted_at IS NULL AND NOT coalesce(pr.is_demo, false)
      AND pr.haroo_type::text = 'ouvrier' AND o.user_id <> actor
      AND (v_skill IS NULL OR EXISTS (
        SELECT 1 FROM unnest(o.competences) s WHERE lower(s) LIKE '%' || v_skill || '%'))
    ORDER BY 7, 4 DESC NULLS LAST, o.id
    LIMIT 40
  ) x;
  RETURN out;
END $$;

REVOKE ALL ON FUNCTION private.market_phone(text), private.market_phone_shown(text),
  private.market_own_phone(uuid),
  private.market_person(uuid), private.market_open(public.producer_announcements),
  private.market_announcement_json(public.producer_announcements),
  private.market_for_author(public.market_responses),
  private.market_for_responder(public.market_responses), private.market_unread(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.market_respond(uuid, text, numeric, text),
  public.market_invite(uuid, uuid, text), public.market_decide(uuid, boolean),
  public.market_withdraw(uuid), public.market_close(uuid), public.market_activity(),
  public.market_unread(), public.market_seen(), public.market_workers(uuid, uuid, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.market_respond(uuid, text, numeric, text),
  public.market_invite(uuid, uuid, text), public.market_decide(uuid, boolean),
  public.market_withdraw(uuid), public.market_close(uuid), public.market_activity(),
  public.market_unread(), public.market_seen(), public.market_workers(uuid, uuid, uuid, text)
  TO authenticated;
