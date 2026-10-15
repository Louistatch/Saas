-- HarooLife : les messages privés hors du jeu. Une personne voit, dans son tableau de bord,
-- les conversations privées où on lui a écrit (non lus compris) et peut répondre ; elle reçoit
-- une notification sur son téléphone si elle a activé les alertes.
--   - haroolife_dm_reads : jusqu'où chacun a lu chaque conversation (le non-lu survit au jeu) ;
--   - haroolife_dm_push : file d'alertes « X t'a écrit », expédiée une seule fois par
--     /api/push/dispatch, au plus une par conversation et par 10 minutes ;
--   - haroolife_dm_inbox() / haroolife_dm_read(room) : lues par le tableau de bord et le jeu.
-- Dépend de 20261015_130000_haroolife_chat_dm.sql (salons dm:, clés d'auteur, blocages).
-- Additif : aucune table, ligne ni fonction existante n'est modifiée.
-- Retour arrière : supabase/rollbacks/20261015_140000_haroolife_dm_inbox.rollback.sql

-- 1. Position de lecture de chaque personne dans chacune de ses conversations.
CREATE TABLE public.haroolife_dm_reads (
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room text NOT NULL CHECK (room ~ '^dm:[0-9a-f]{16}:[0-9a-f]{16}$'),
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, room)
);
ALTER TABLE public.haroolife_dm_reads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_dm_reads FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_dm_reads TO service_role;

-- 2. Alertes à expédier (lues seulement par le serveur, clé service_role).
CREATE TABLE public.haroolife_dm_push (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room text NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);
CREATE INDEX haroolife_dm_push_pending ON public.haroolife_dm_push(id) WHERE dispatched_at IS NULL;
CREATE INDEX haroolife_dm_push_recent ON public.haroolife_dm_push(recipient_id, room, created_at DESC);
ALTER TABLE public.haroolife_dm_push ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.haroolife_dm_push FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.haroolife_dm_push TO service_role;

-- 3. À chaque message privé : l'auteur a lu sa conversation jusque-là, et son correspondant
--    est prévenu (une alerte par conversation et par 10 minutes, pas une par message).
CREATE OR REPLACE FUNCTION private.haroolife_dm_after_send()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE mine text := private.haroolife_author_key(NEW.user_id); other uuid; sender text;
BEGIN
  INSERT INTO public.haroolife_dm_reads(user_id, room, read_at) VALUES (NEW.user_id, NEW.room, NEW.created_at)
  ON CONFLICT (user_id, room) DO UPDATE SET read_at = greatest(public.haroolife_dm_reads.read_at, EXCLUDED.read_at);
  other := private.haroolife_user_by_key(
    CASE WHEN split_part(NEW.room, ':', 2) = mine THEN split_part(NEW.room, ':', 3) ELSE split_part(NEW.room, ':', 2) END
  );
  IF other IS NULL OR other = NEW.user_id THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.haroolife_dm_push p
             WHERE p.recipient_id = other AND p.room = NEW.room AND p.created_at > now() - interval '10 minutes') THEN
    RETURN NEW;
  END IF;
  sender := coalesce((SELECT h.display_name FROM public.haroolife_residents h WHERE h.user_id = NEW.user_id), 'Un habitant');
  INSERT INTO public.haroolife_dm_push(recipient_id, room, title, body)
  VALUES (other, NEW.room, left(sender || ' t’a écrit', 120),
          CASE WHEN length(NEW.body) > 140 THEN left(NEW.body, 139) || '…' ELSE NEW.body END);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION private.haroolife_dm_after_send() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER haroolife_dm_after_send
  AFTER INSERT ON public.haroolife_chat_messages
  FOR EACH ROW WHEN (NEW.room LIKE 'dm:%')
  EXECUTE FUNCTION private.haroolife_dm_after_send();

-- 4. Boîte de réception : chaque conversation privée ouverte, avec le correspondant, le dernier
--    message et le nombre de messages reçus non lus. La plus récente d'abord.
CREATE OR REPLACE FUNCTION public.haroolife_dm_inbox()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid()); mine text; out jsonb := '[]'; r text; u uuid;
        last public.haroolife_chat_messages; seen timestamptz; unread integer;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  mine := private.haroolife_author_key(actor);
  FOREACH r IN ARRAY private.haroolife_dm_rooms(actor) LOOP
    u := private.haroolife_user_by_key(
      CASE WHEN split_part(r, ':', 2) = mine THEN split_part(r, ':', 3) ELSE split_part(r, ':', 2) END
    );
    CONTINUE WHEN u IS NULL;
    SELECT * INTO last FROM public.haroolife_chat_messages m WHERE m.room = r ORDER BY m.seq DESC LIMIT 1;
    SELECT d.read_at INTO seen FROM public.haroolife_dm_reads d WHERE d.user_id = actor AND d.room = r;
    SELECT count(*) INTO unread FROM public.haroolife_chat_messages m
      WHERE m.room = r AND m.user_id <> actor AND m.deleted_at IS NULL
        AND m.created_at > coalesce(seen, '-infinity'::timestamptz);
    out := out || jsonb_build_array(jsonb_build_object(
      'room', r,
      'peer', private.haroolife_peer_json(u),
      'last', jsonb_build_object(
        'body', CASE WHEN last.deleted_at IS NULL THEN last.body ELSE '' END,
        'mine', last.user_id = actor,
        'at', last.created_at
      ),
      'unread', unread
    ));
  END LOOP;
  RETURN out;
END $$;

-- 5. La personne a lu une conversation (ouverte dans le jeu ou dans le tableau de bord).
CREATE OR REPLACE FUNCTION public.haroolife_dm_read(p_room text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := (SELECT auth.uid());
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Connexion requise' USING ERRCODE = '42501'; END IF;
  IF p_room IS NULL OR p_room NOT LIKE 'dm:%' OR NOT private.haroolife_chat_allowed(actor, p_room, false) THEN
    RAISE EXCEPTION 'Salon non autorisé' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.haroolife_dm_reads(user_id, room, read_at) VALUES (actor, p_room, now())
  ON CONFLICT (user_id, room) DO UPDATE SET read_at = now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.haroolife_dm_inbox(), public.haroolife_dm_read(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.haroolife_dm_inbox(), public.haroolife_dm_read(text) TO authenticated;
