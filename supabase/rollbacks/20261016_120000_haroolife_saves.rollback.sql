-- Retour arrière de 20261016_120000_haroolife_saves.sql : les parties en ligne sont supprimées
-- (les joueurs gardent leur partie locale) et l'envoi d'argent revient à sa version précédente.
DROP FUNCTION IF EXISTS public.haroolife_save_put(jsonb, integer);
DROP FUNCTION IF EXISTS public.haroolife_save_get();
DROP FUNCTION IF EXISTS private.haroolife_known_wallet(uuid);
DROP FUNCTION IF EXISTS private.haroolife_earn_cap(numeric);
DROP TABLE IF EXISTS public.haroolife_saves;

-- haroolife_money_send telle que dans 20261015_150000_haroolife_money.sql.
CREATE OR REPLACE FUNCTION public.haroolife_money_send(p_key text, p_amount integer, p_note text, p_client_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); other uuid; sent integer; t public.haroolife_money_transfers;
        v_note text := nullif(left(regexp_replace(trim(coalesce(p_note, '')), '\s+', ' ', 'g'), 80), '');
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.haroolife_residents WHERE user_id = actor) THEN
    RAISE EXCEPTION 'Choisis d’abord ta maison pour envoyer de l’argent' USING ERRCODE = '42501';
  END IF;
  IF p_client_id IS NULL THEN RAISE EXCEPTION 'Envoi invalide' USING ERRCODE = '22023'; END IF;
  -- Même envoi répété (coupure réseau) : le même transfert, sans double débit.
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
  INSERT INTO public.haroolife_money_transfers(sender_id, recipient_id, amount, note, client_id)
  VALUES (actor, other, p_amount, v_note, p_client_id) RETURNING * INTO t;
  RETURN jsonb_build_object('id', t.id, 'amount', t.amount, 'to', private.haroolife_peer_json(other), 'duplicate', false);
END $$;
