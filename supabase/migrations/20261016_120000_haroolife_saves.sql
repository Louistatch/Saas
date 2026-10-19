-- HarooLife : la partie sauvegardée en ligne. Jusqu'ici la partie (et le portefeuille du jeu) ne
-- vivait que dans le téléphone : perdue avec le navigateur, et modifiable à la main.
--   - haroolife_saves : la dernière partie de chaque joueur, avec un numéro de version
--     (concurrence optimiste : deux appareils ne s'écrasent jamais en silence) ;
--   - haroolife_save_get() / haroolife_save_put(partie, version) ;
--   - le solde est plafonné côté serveur : entre deux sauvegardes, il ne peut monter que de ce
--     qu'un joueur peut gagner dans le temps écoulé (HAROOLIFE_EARN_PER_MIN par minute, plus une
--     marge), plus l'argent reçu d'autres joueurs, moins l'argent envoyé. Au-delà, il est ramené
--     au plafond ;
--   - haroolife_money_send n'accepte plus un envoi que si le solde connu du serveur le couvre.
-- Argent du jeu uniquement (FCFA fictifs, jamais d'argent réel).
-- Dépend de 20261015_150000_haroolife_money.sql.
-- Additif : une table et trois fonctions nouvelles ; haroolife_money_send est remplacée par une
-- version qui garde toutes ses règles et ajoute le contrôle du solde. Aucune ligne n'est touchée.
-- Retour arrière : supabase/rollbacks/20261016_120000_haroolife_saves.rollback.sql

CREATE TABLE public.haroolife_saves (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  save jsonb NOT NULL CHECK (jsonb_typeof(save) = 'object' AND octet_length(save::text) <= 262144),
  wallet bigint NOT NULL CHECK (wallet BETWEEN 0 AND 100000000),
  version integer NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.haroolife_saves ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_saves FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_saves TO service_role;

-- Plafond de gain : ce qu’un joueur peut gagner en jouant, par minute réelle entière (courses de zémidjan
-- ou de taxi, métiers, petits boulots), et la marge accordée à chaque sauvegarde.
CREATE OR REPLACE FUNCTION private.haroolife_earn_cap(p_minutes numeric)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (20000 + 6000 * floor(greatest(0, least(p_minutes, 1440))))::bigint
$$;

-- Solde que le serveur reconnaît maintenant : la dernière sauvegarde, plus ce qui a été reçu,
-- moins ce qui a été envoyé depuis.
CREATE OR REPLACE FUNCTION private.haroolife_known_wallet(p_user uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT s.wallet
    + coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.recipient_id = p_user AND t.claimed_at > s.updated_at), 0)
    - coalesce((SELECT sum(t.amount) FROM public.haroolife_money_transfers t
                WHERE t.sender_id = p_user AND t.created_at > s.updated_at), 0)
  FROM public.haroolife_saves s WHERE s.user_id = p_user
$$;

CREATE OR REPLACE FUNCTION public.haroolife_save_get()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); s public.haroolife_saves;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO s FROM public.haroolife_saves WHERE user_id = actor;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('save', s.save, 'version', s.version, 'updated_at', s.updated_at, 'wallet', s.wallet);
END $$;

-- Enregistrer la partie. p_version est la version sur laquelle l'appareil s'appuie (0 pour une
-- première sauvegarde) : si un autre appareil a sauvegardé entre-temps, rien n'est écrit et la
-- partie la plus récente est rendue (conflict). Le portefeuille est ramené au plafond si besoin.
CREATE OR REPLACE FUNCTION public.haroolife_save_put(p_save jsonb, p_version integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); s public.haroolife_saves; wanted bigint; allowed bigint;
        v_save jsonb := p_save; clamped boolean := false;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_save IS NULL OR jsonb_typeof(p_save) IS DISTINCT FROM 'object' OR (p_save->>'v') IS DISTINCT FROM '1'
     OR jsonb_typeof(p_save->'life') IS DISTINCT FROM 'object'
     OR jsonb_typeof(p_save->'life'->'wallet') IS DISTINCT FROM 'number' THEN
    RAISE EXCEPTION 'Partie invalide' USING ERRCODE = '22023';
  END IF;
  IF octet_length(p_save::text) > 262144 THEN RAISE EXCEPTION 'Partie trop lourde' USING ERRCODE = '22023'; END IF;
  wanted := greatest(0, floor((p_save->'life'->>'wallet')::numeric))::bigint;
  SELECT * INTO s FROM public.haroolife_saves WHERE user_id = actor FOR UPDATE;
  IF FOUND AND s.version <> coalesce(p_version, 0) THEN
    RETURN jsonb_build_object('conflict', true, 'save', s.save, 'version', s.version,
                              'updated_at', s.updated_at, 'wallet', s.wallet);
  END IF;
  IF FOUND THEN
    allowed := private.haroolife_known_wallet(actor)
               + private.haroolife_earn_cap(extract(epoch FROM now() - s.updated_at) / 60);
  ELSE
    -- Première sauvegarde (une partie locale qui existait avant) : au plus 100 000 FCFA.
    allowed := 100000;
  END IF;
  allowed := least(allowed, 100000000);
  IF wanted > allowed THEN
    wanted := allowed;
    clamped := true;
  END IF;
  v_save := jsonb_set(v_save, '{life,wallet}', to_jsonb(wanted));
  INSERT INTO public.haroolife_saves(user_id, save, wallet, version, updated_at)
  VALUES (actor, v_save, wanted, 1, now())
  ON CONFLICT (user_id) DO UPDATE
    SET save = EXCLUDED.save, wallet = EXCLUDED.wallet,
        version = public.haroolife_saves.version + 1, updated_at = now()
  RETURNING * INTO s;
  RETURN jsonb_build_object('ok', true, 'version', s.version, 'updated_at', s.updated_at,
                            'wallet', s.wallet, 'clamped', clamped);
END $$;

-- L'envoi d'argent garde toutes ses règles (maison, clé, blocage, 50 000 par envoi, 100 000 par
-- jour, idempotence) et ne passe plus que si le solde connu du serveur le couvre.
CREATE OR REPLACE FUNCTION public.haroolife_money_send(p_key text, p_amount integer, p_note text, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid; sent integer; t public.haroolife_money_transfers; known bigint;
        v_note text := nullif(left(regexp_replace(trim(coalesce(p_note, '')), '\s+', ' ', 'g'), 80), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RAISE EXCEPTION 'Choisis d’abord ta maison pour envoyer de l’argent' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Envoi invalide' USING ERRCODE = '22023'; END IF;
  SELECT * INTO t FROM public.haroolife_money_transfers WHERE sender_id = actor AND client_id = p_client_id;
  IF FOUND THEN
    RETURN jsonb_build_object('id', t.id, 'amount', t.amount, 'to', private.haroolife_peer_json(t.recipient_id), 'duplicate', true);
  END IF;
  IF p_amount IS NULL OR p_amount < 1 OR p_amount > 50000 THEN
    RAISE EXCEPTION 'Montant entre 1 et 50 000 FCFA' USING ERRCODE = '22023';
  END IF;
  other := private.haroolife_user_by_key(p_key);
  IF other IS NULL OR other = actor THEN RAISE EXCEPTION 'Joueur introuvable' USING ERRCODE = '42501'; END IF;
  IF private.haroolife_dm_blocked(actor, other) THEN
    RAISE EXCEPTION 'Envoi non autorisé' USING ERRCODE = '42501';
  END IF;
  SELECT coalesce(sum(amount), 0) INTO sent FROM public.haroolife_money_transfers
    WHERE sender_id = actor AND created_at > now() - interval '24 hours';
  IF sent + p_amount > 100000 THEN
    RAISE EXCEPTION 'Plafond atteint : 100 000 FCFA envoyés par jour' USING ERRCODE = '22023';
  END IF;
  -- Le solde de la partie sauvegardée en ligne (verrouillée le temps de l'envoi).
  PERFORM 1 FROM public.haroolife_saves WHERE user_id = actor FOR UPDATE;
  known := private.haroolife_known_wallet(actor);
  IF known IS NULL THEN
    RAISE EXCEPTION 'Ta partie n’est pas encore sauvegardée en ligne : réessaie dans un instant' USING ERRCODE = '22023';
  END IF;
  IF known < p_amount THEN
    RAISE EXCEPTION 'Solde insuffisant pour cet envoi' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.haroolife_money_transfers(sender_id, recipient_id, amount, note, client_id)
  VALUES (actor, other, p_amount, v_note, p_client_id) RETURNING * INTO t;
  RETURN jsonb_build_object('id', t.id, 'amount', t.amount, 'to', private.haroolife_peer_json(other), 'duplicate', false);
END $$;

REVOKE ALL ON FUNCTION private.haroolife_earn_cap(numeric), private.haroolife_known_wallet(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.haroolife_save_get(), public.haroolife_save_put(jsonb, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_save_get(), public.haroolife_save_put(jsonb, integer) TO authenticated;
