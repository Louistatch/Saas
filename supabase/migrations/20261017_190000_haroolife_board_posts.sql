-- HarooLife : les joueurs louent les panneaux publicitaires de la rue avec l'argent du jeu et y
-- passent une information (« Je vends mon maïs à Bè », « Anniversaire de Kossi samedi »).
--   - haroolife_board_posts : une location = un panneau, un titre, un message, une couleur, une
--     durée (24 h ou 3 jours), payée en FCFA du jeu (jamais d'argent réel) ;
--   - haroolife_board_rent(...) : louer un panneau libre ; le loyer est retiré du solde que le
--     serveur connaît (comme l'envoi d'argent) ; pas de numéro, de lien ni d'e-mail ;
--   - haroolife_board_posts_live(ville) : ce qui est affiché maintenant (lisible par tous) ;
--   - haroolife_board_report(location, motif) : un joueur signale ; trois signalements masquent
--     le panneau en attendant l'équipe ;
--   - haroolife_board_mod_queue() / haroolife_board_mod_act(location, action, motif) : l'équipe
--     (super_admin) voit les panneaux signalés, les masque, les rétablit ou classe sans suite ;
--     la suspension de l'auteur passe par haroolife_mod_act('player', ...).
-- Les emplacements sont ceux de lib/haroolife/ads/campaigns.ts (PLACEMENTS), recopiés ici :
-- tests/haroolife-board-sql.test.mjs vérifie que les deux listes sont identiques.
-- Dépend de 20261016_120000_haroolife_saves.sql et 20261016_130000_haroolife_moderation.sql.
-- Additif : deux tables et sept fonctions nouvelles ; private.haroolife_known_wallet est
-- remplacée par une version qui garde son calcul et retire aussi les loyers payés depuis la
-- dernière sauvegarde. Aucune ligne existante n'est touchée.
-- Retour arrière : supabase/rollbacks/20261017_190000_haroolife_board_posts.rollback.sql

CREATE TABLE public.haroolife_board_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placement text NOT NULL CHECK (placement ~ '^(lome|kara)-[a-z-]{2,24}$'),
  author_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 32),
  body text NOT NULL CHECK (char_length(body) BETWEEN 3 AND 120),
  palette smallint NOT NULL DEFAULT 0 CHECK (palette BETWEEN 0 AND 3),
  hours smallint NOT NULL CHECK (hours IN (24, 72)),
  price integer NOT NULL CHECK (price > 0),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz NOT NULL,
  hidden_at timestamptz,
  hidden_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  hidden_reason text CHECK (hidden_reason IS NULL OR length(hidden_reason) <= 200),
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, client_id),
  CHECK (ends_at > starts_at)
);
CREATE INDEX haroolife_board_posts_live_idx ON public.haroolife_board_posts (placement, ends_at);
CREATE INDEX haroolife_board_posts_author_idx ON public.haroolife_board_posts (author_id, created_at);

CREATE TABLE public.haroolife_board_reports (
  post_id uuid NOT NULL REFERENCES public.haroolife_board_posts(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN ('insulte', 'arnaque', 'choquant', 'autre')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  PRIMARY KEY (post_id, reporter_id)
);

ALTER TABLE public.haroolife_board_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.haroolife_board_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_board_posts, public.haroolife_board_reports FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_board_posts, public.haroolife_board_reports TO service_role;

-- La ville d'un emplacement (null : inconnu). Même liste que PLACEMENTS côté jeu.
CREATE OR REPLACE FUNCTION private.haroolife_board_locality(p_placement text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_placement = ANY (ARRAY[
      'lome-avenue', 'lome-jardin', 'lome-assigame', 'lome-universite', 'lome-chu-tokoin',
      'lome-gare-agoe', 'lome-marche-be', 'lome-hotel-de-ville', 'lome-stade-kegue',
      'lome-marche-adidogome', 'lome-marche-tokoin', 'lome-port-be']) THEN 'lome'
    WHEN p_placement = ANY (ARRAY[
      'kara-gare', 'kara-marche', 'kara-grand-marche', 'kara-universite', 'kara-chu',
      'kara-prefecture', 'kara-lycee', 'kara-marche-kpewa']) THEN 'kara'
  END
$$;

-- Un texte de panneau : espaces réduits, sans caractères de contrôle.
CREATE OR REPLACE FUNCTION private.haroolife_board_clean(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT trim(regexp_replace(regexp_replace(coalesce(p_text, ''), '[[:cntrl:]]', ' ', 'g'), '\s+', ' ', 'g'))
$$;

-- Ce qu'un panneau n'affiche jamais : un lien, un e-mail, un numéro de téléphone (huit chiffres
-- ou plus, même séparés par des espaces, points ou tirets). Null : rien à redire.
CREATE OR REPLACE FUNCTION private.haroolife_board_text_problem(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_text ~* '[^[:space:]@]+@[^[:space:]@]+\.[a-z]{2,}' THEN 'email'
    WHEN p_text ~* '(https?:|www\.|[a-z0-9-]\.(com|net|org|tg|fr|io|me|ly|co|info|biz|app|xyz)([^a-z0-9_]|$))' THEN 'lien'
    WHEN regexp_replace(p_text, '[[:space:].()/+-]', '', 'g') ~ '[0-9]{8,}' THEN 'telephone'
  END
$$;

-- Qui a loué, tel que les autres joueurs le voient : son nom d'utilisateur, sinon son nom affiché.
CREATE OR REPLACE FUNCTION private.haroolife_board_author(p_user uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(
    (SELECT '@' || u.username FROM public.haroolife_usernames u WHERE u.user_id = p_user),
    (SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = p_user),
    'Habitant')
$$;

-- Solde que le serveur reconnaît : la dernière sauvegarde, plus ce qui a été reçu, moins ce qui
-- a été envoyé et les loyers de panneaux payés depuis.
CREATE OR REPLACE FUNCTION private.haroolife_known_wallet(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.wallet
    + coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.recipient_id = p_user AND t.claimed_at > s.updated_at), 0)
    - coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.sender_id = p_user AND t.created_at > s.updated_at), 0)
    - coalesce((SELECT sum(b.price) FROM public.haroolife_board_posts b
                WHERE b.author_id = p_user AND b.created_at > s.updated_at), 0)
  FROM public.haroolife_saves s WHERE s.user_id = p_user
$$;

CREATE OR REPLACE FUNCTION private.haroolife_board_json(p public.haroolife_board_posts, p_viewer uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'id', p.id, 'placement', p.placement, 'title', p.title, 'body', p.body, 'palette', p.palette,
    'author', private.haroolife_board_author(p.author_id), 'mine', coalesce(p.author_id = p_viewer, false),
    'startsAt', p.starts_at, 'endsAt', p.ends_at)
$$;

-- Louer un panneau libre. p_client_id rend l'appel rejouable : la même location n'est jamais
-- payée deux fois.
CREATE OR REPLACE FUNCTION public.haroolife_board_rent(
  p_placement text, p_hours integer, p_title text, p_body text, p_palette integer, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); p public.haroolife_board_posts; cost integer;
        v_title text := private.haroolife_board_clean(p_title);
        v_body text := private.haroolife_board_clean(p_body);
        known bigint; busy timestamptz;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RAISE EXCEPTION 'Choisis d’abord ta maison pour louer un panneau' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (SELECT 1 FROM public.haroolife_chat_bans WHERE user_id = actor AND until > now()) THEN
    RAISE EXCEPTION 'Ton compte ne peut pas publier pour le moment' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Location invalide' USING ERRCODE = '22023'; END IF;
  SELECT * INTO p FROM public.haroolife_board_posts WHERE author_id = actor AND client_id = p_client_id;
  IF FOUND THEN
    RETURN private.haroolife_board_json(p, actor) || jsonb_build_object('price', p.price, 'duplicate', true);
  END IF;
  IF private.haroolife_board_locality(p_placement) IS NULL THEN
    RAISE EXCEPTION 'Panneau inconnu' USING ERRCODE = '22023';
  END IF;
  cost := CASE p_hours WHEN 24 THEN 5000 WHEN 72 THEN 12000 END;
  IF cost IS NULL THEN RAISE EXCEPTION 'Durée : 24 heures ou 3 jours' USING ERRCODE = '22023'; END IF;
  IF char_length(v_title) NOT BETWEEN 3 AND 32 THEN
    RAISE EXCEPTION 'Titre : de 3 à 32 caractères' USING ERRCODE = '22023';
  END IF;
  IF char_length(v_body) NOT BETWEEN 3 AND 120 THEN
    RAISE EXCEPTION 'Message : de 3 à 120 caractères' USING ERRCODE = '22023';
  END IF;
  IF private.haroolife_board_text_problem(v_title || ' ' || v_body) IS NOT NULL THEN
    RAISE EXCEPTION 'Pas de numéro de téléphone, de lien ni d’e-mail sur un panneau' USING ERRCODE = '22023';
  END IF;
  IF p_palette IS NULL OR p_palette NOT BETWEEN 0 AND 3 THEN
    RAISE EXCEPTION 'Couleur inconnue' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM public.haroolife_board_posts WHERE author_id = actor
             AND hidden_at IS NULL AND ends_at > now()) THEN
    RAISE EXCEPTION 'Tu as déjà un panneau loué : attends la fin de ta location' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(*) FROM public.haroolife_board_posts WHERE author_id = actor
      AND created_at > now() - interval '24 hours') >= 2 THEN
    RAISE EXCEPTION 'Deux locations par jour au plus' USING ERRCODE = '22023';
  END IF;
  -- Un panneau, une location à la fois : deux joueurs qui louent ensemble sont départagés ici.
  PERFORM pg_advisory_xact_lock(hashtext('haroolife_board:' || p_placement));
  SELECT max(ends_at) INTO busy FROM public.haroolife_board_posts
    WHERE placement = p_placement AND hidden_at IS NULL AND ends_at > now();
  IF busy IS NOT NULL THEN
    RAISE EXCEPTION 'Ce panneau est déjà loué : choisis-en un autre' USING ERRCODE = '22023';
  END IF;
  -- Le solde de la partie sauvegardée en ligne (verrouillée le temps de la location).
  PERFORM 1 FROM public.haroolife_saves WHERE user_id = actor FOR UPDATE;
  known := private.haroolife_known_wallet(actor);
  IF known IS NULL THEN
    RAISE EXCEPTION 'Ta partie n’est pas encore sauvegardée en ligne : réessaie dans un instant' USING ERRCODE = '22023';
  END IF;
  IF known < cost THEN
    RAISE EXCEPTION 'Solde insuffisant pour cette location' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_board_posts(placement, author_id, title, body, palette, hours, price,
                                           ends_at, client_id)
  VALUES (p_placement, actor, v_title, v_body, p_palette, p_hours, cost,
          now() + make_interval(hours => p_hours), p_client_id)
  RETURNING * INTO p;
  RETURN private.haroolife_board_json(p, actor) || jsonb_build_object('price', p.price, 'duplicate', false);
END $$;

-- Ce que les panneaux d'une ville affichent maintenant (visiteurs et joueurs).
CREATE OR REPLACE FUNCTION public.haroolife_board_posts_live(p_locality text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT coalesce(jsonb_agg(private.haroolife_board_json(p, (SELECT auth.uid())) ORDER BY p.placement), '[]')
  FROM public.haroolife_board_posts p
  WHERE p.hidden_at IS NULL AND p.starts_at <= now() AND p.ends_at > now()
    AND private.haroolife_board_locality(p.placement) = p_locality
$$;

-- Signaler un panneau loué. Trois joueurs différents : il est masqué jusqu'à la décision de
-- l'équipe.
CREATE OR REPLACE FUNCTION public.haroolife_board_report(p_post uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); p public.haroolife_board_posts; n integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_reason IS NULL OR p_reason NOT IN ('insulte', 'arnaque', 'choquant', 'autre') THEN
    RAISE EXCEPTION 'Motif inconnu' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO p FROM public.haroolife_board_posts WHERE id = p_post;
  IF NOT FOUND THEN RAISE EXCEPTION 'Panneau introuvable' USING ERRCODE = '22023'; END IF;
  IF p.author_id = actor THEN
    RAISE EXCEPTION 'Impossible de signaler son propre panneau' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_board_reports(post_id, reporter_id, reason)
  VALUES (p_post, actor, p_reason) ON CONFLICT DO NOTHING;
  SELECT count(*) INTO n FROM public.haroolife_board_reports WHERE post_id = p_post AND resolved_at IS NULL;
  IF n >= 3 AND p.hidden_at IS NULL THEN
    UPDATE public.haroolife_board_posts
      SET hidden_at = now(), hidden_reason = 'Signalé par plusieurs joueurs'
      WHERE id = p_post;
    RETURN jsonb_build_object('ok', true, 'hidden', true);
  END IF;
  RETURN jsonb_build_object('ok', true, 'hidden', p.hidden_at IS NOT NULL);
END $$;

-- Pour l'équipe : les panneaux signalés (ouverts) et ceux masqués automatiquement.
CREATE OR REPLACE FUNCTION public.haroolife_board_mod_queue()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  PERFORM private.haroolife_assert_moderator();
  RETURN coalesce((
    SELECT jsonb_agg(x ORDER BY x->>'last' DESC) FROM (
      SELECT jsonb_build_object(
        'id', p.id, 'placement', p.placement, 'title', p.title, 'body', p.body,
        'endsAt', p.ends_at, 'hidden', p.hidden_at IS NOT NULL, 'hiddenReason', p.hidden_reason,
        'author', private.haroolife_mod_person(p.author_id),
        'count', count(r.reporter_id), 'last', max(r.created_at),
        'reasons', jsonb_agg(DISTINCT r.reason)
      ) AS x
      FROM public.haroolife_board_reports r
      JOIN public.haroolife_board_posts p ON p.id = r.post_id
      WHERE r.resolved_at IS NULL
      GROUP BY p.id
    ) q), '[]');
END $$;

-- Une décision de l'équipe : hide (masqué pour tous), show (rétabli), dismiss (classé sans
-- suite, l'état ne change pas). Les signalements ouverts sont fermés.
CREATE OR REPLACE FUNCTION public.haroolife_board_mod_act(p_post uuid, p_action text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := private.haroolife_assert_moderator(); p public.haroolife_board_posts;
        why text := left(coalesce(nullif(trim(p_reason), ''), 'Décision de modération'), 200);
BEGIN
  SELECT * INTO p FROM public.haroolife_board_posts WHERE id = p_post FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Panneau introuvable' USING ERRCODE = '22023'; END IF;
  IF p_action = 'hide' THEN
    UPDATE public.haroolife_board_posts SET hidden_at = coalesce(hidden_at, now()), hidden_by = actor,
           hidden_reason = why WHERE id = p_post RETURNING * INTO p;
  ELSIF p_action = 'show' THEN
    UPDATE public.haroolife_board_posts SET hidden_at = NULL, hidden_by = NULL, hidden_reason = NULL
      WHERE id = p_post RETURNING * INTO p;
  ELSIF p_action IS DISTINCT FROM 'dismiss' THEN
    RAISE EXCEPTION 'Action inconnue' USING ERRCODE = '22023';
  END IF;
  UPDATE public.haroolife_board_reports SET resolved_at = now(), resolved_by = actor
    WHERE post_id = p_post AND resolved_at IS NULL;
  RETURN jsonb_build_object('ok', true, 'hidden', p.hidden_at IS NOT NULL,
                            'author', private.haroolife_mod_person(p.author_id));
END $$;

REVOKE ALL ON FUNCTION private.haroolife_board_locality(text), private.haroolife_board_clean(text),
  private.haroolife_board_text_problem(text), private.haroolife_board_author(uuid),
  private.haroolife_board_json(public.haroolife_board_posts, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.haroolife_known_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_board_rent(text, integer, text, text, integer, uuid),
  public.haroolife_board_posts_live(text), public.haroolife_board_report(uuid, text),
  public.haroolife_board_mod_queue(), public.haroolife_board_mod_act(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_board_posts_live(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.haroolife_board_rent(text, integer, text, text, integer, uuid),
  public.haroolife_board_report(uuid, text), public.haroolife_board_mod_queue(),
  public.haroolife_board_mod_act(uuid, text, text)
  TO authenticated;
