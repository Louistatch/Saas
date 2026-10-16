-- Retour arrière de 20261016_140000_haroolife_visitors.sql : les trois fonctions reviennent à leur
-- version précédente (les visiteurs écrivent alors comme tout compte). À appliquer avec la
-- désactivation des connexions anonymes dans Supabase.
CREATE OR REPLACE FUNCTION private.haroolife_chat_allowed(p_user uuid, p_room text, p_write boolean)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE prof public.profiles; kind text := split_part(p_room, ':', 1); ref text := split_part(p_room, ':', 2);
        mine text; a text; b text; other uuid;
BEGIN
  SELECT * INTO prof FROM public.profiles WHERE id = p_user AND deleted_at IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_write AND EXISTS (SELECT 1 FROM public.haroolife_chat_bans WHERE user_id = p_user AND until > now()) THEN
    RETURN false;
  END IF;
  IF kind = 'dm' THEN
    IF p_room !~ '^dm:[0-9a-f]{16}:[0-9a-f]{16}$' THEN RETURN false; END IF;
    a := split_part(p_room, ':', 2); b := split_part(p_room, ':', 3);
    IF a >= b THEN RETURN false; END IF;
    mine := private.haroolife_author_key(p_user);
    IF mine NOT IN (a, b) THEN RETURN false; END IF;
    other := private.haroolife_user_by_key(CASE WHEN mine = a THEN b ELSE a END);
    IF other IS NULL OR private.haroolife_dm_blocked(p_user, other) THEN RETURN false; END IF;
    RETURN NOT p_write OR EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user);
  END IF;
  IF prof.role = 'super_admin' THEN RETURN true; END IF;
  IF kind IN ('world', 'locality') THEN
    RETURN NOT p_write OR EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user);
  END IF;
  IF ref !~ '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  IF kind = 'canton' THEN
    RETURN EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = p_user AND canton_id = ref::uuid);
  END IF;
  IF kind = 'coop' THEN
    RETURN coalesce(prof.cooperative_id = ref::uuid, false) AND prof.role IN ('member', 'cooperative_admin');
  END IF;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.haroolife_chat_me()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); rooms text[] := '{}'; r text; home public.haroolife_residents; prof public.profiles;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  SELECT * INTO prof FROM public.profiles WHERE id = actor AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Compte inconnu' USING ERRCODE = '42501'; END IF;
  SELECT * INTO home FROM public.haroolife_residents WHERE user_id = actor;
  FOREACH r IN ARRAY ARRAY['world:togo', 'locality:lome', 'locality:kara'] LOOP
    IF private.haroolife_chat_allowed(actor, r, false) THEN rooms := rooms || r; END IF;
  END LOOP;
  IF home.canton_id IS NOT NULL THEN rooms := rooms || ('canton:' || home.canton_id::text); END IF;
  IF prof.cooperative_id IS NOT NULL AND private.haroolife_chat_allowed(actor, 'coop:' || prof.cooperative_id::text, false) THEN
    rooms := rooms || ('coop:' || prof.cooperative_id::text);
  END IF;
  rooms := rooms || private.haroolife_dm_rooms(actor);
  RETURN jsonb_build_object(
    'key', private.haroolife_author_key(actor),
    'name', coalesce(home.display_name, 'Habitant'),
    'pagne', coalesce(home.pagne, 1),
    'can_write', home.user_id IS NOT NULL OR prof.role = 'super_admin',
    'rooms', to_jsonb(rooms),
    'blocked', coalesce((SELECT jsonb_agg(private.haroolife_author_key(b.blocked_id))
                         FROM public.haroolife_chat_blocks b WHERE b.user_id = actor), '[]')
  );
END $$;

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

DROP FUNCTION IF EXISTS private.haroolife_actor_is_visitor();
