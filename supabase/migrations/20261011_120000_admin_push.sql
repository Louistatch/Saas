-- Console de validation installable : abonnements push et journal d'événements admin.
-- Additif. Tables accessibles uniquement par service_role (API serveur) ; aucun accès client direct.
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL UNIQUE CHECK (endpoint ~ '^https://' AND length(endpoint) <= 1000),
  p256dh text NOT NULL CHECK (length(p256dh) <= 200),
  auth text NOT NULL CHECK (length(auth) <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failures integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS push_subscriptions_user ON public.push_subscriptions(user_id);

-- kind : 'dossier.nouveau' (dossier professionnel à valider) | 'haroolife.groupe' (groupe créé).
CREATE TABLE IF NOT EXISTS public.admin_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('dossier.nouveau','haroolife.groupe')),
  faitiere_id uuid REFERENCES public.cooperatives(id),
  title text NOT NULL CHECK (length(title) <= 120),
  body text NOT NULL CHECK (length(body) <= 300),
  link text NOT NULL CHECK (link ~ '^/'),
  created_at timestamptz NOT NULL DEFAULT now(),
  dispatched_at timestamptz
);
CREATE INDEX IF NOT EXISTS admin_events_pending ON public.admin_events(id) WHERE dispatched_at IS NULL;

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_subscriptions, public.admin_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.push_subscriptions, public.admin_events TO service_role;

-- Destinataires autorisés d'un événement : super_admin toujours ; pour un dossier, les opérateurs
-- officiers ayant un mandat actif 'professionals.validate' sur la faîtière (mêmes règles que
-- has_partner_org_access) ; pour HarooLife, les administrateurs de la coopérative du pilote.
CREATE OR REPLACE FUNCTION public.admin_event_recipients(p_kind text, p_faitiere uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT p.id FROM public.profiles p WHERE p.role = 'super_admin' AND p.deleted_at IS NULL
  UNION
  SELECT m.user_id FROM public.partner_organization_assignments a
    JOIN public.partners pa ON pa.id = a.partner_id
    JOIN public.partner_memberships m ON m.partner_id = pa.id
    JOIN public.partner_certifications c ON c.partner_id = pa.id AND c.user_id = m.user_id
    WHERE p_kind = 'dossier.nouveau' AND m.status = 'active'
      AND pa.status IN ('certified','active') AND c.certified_at IS NOT NULL
      AND a.cooperative_id = p_faitiere AND a.status = 'active'
      AND a.started_at <= now() AND (a.ended_at IS NULL OR a.ended_at > now())
      AND EXISTS (SELECT 1 FROM public.partner_assignment_scopes s
        WHERE s.assignment_id = a.id AND s.scope = 'professionals.validate')
  UNION
  SELECT p.id FROM public.profiles p
    WHERE p_kind = 'haroolife.groupe' AND p.role = 'cooperative_admin' AND p.deleted_at IS NULL
      AND p.cooperative_id = p_faitiere;
$$;
REVOKE ALL ON FUNCTION public.admin_event_recipients(text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_event_recipients(text, uuid) TO service_role;

-- Événements : un nouveau dossier en attente, un nouveau groupe HarooLife.
CREATE OR REPLACE FUNCTION private.on_agronome_dossier() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.statut_validation = 'EN_ATTENTE' AND (TG_OP = 'INSERT' OR OLD.statut_validation IS DISTINCT FROM 'EN_ATTENTE') THEN
    INSERT INTO public.admin_events(kind, faitiere_id, title, body, link) VALUES (
      'dossier.nouveau', NEW.faitiere_id, 'Nouveau dossier à valider',
      left(coalesce(nullif(trim(coalesce(NEW.first_name,'') || ' ' || coalesce(NEW.last_name,'')), ''), 'Un professionnel')
        || ' attend la vérification de son dossier.', 300),
      '/operator/professionals');
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW; -- une alerte ne doit jamais bloquer une inscription
END $$;
DROP TRIGGER IF EXISTS admin_event_agronome_dossier ON public.haroo_agronome_profiles;
CREATE TRIGGER admin_event_agronome_dossier AFTER INSERT OR UPDATE OF statut_validation
  ON public.haroo_agronome_profiles FOR EACH ROW EXECUTE FUNCTION private.on_agronome_dossier();

CREATE OR REPLACE FUNCTION private.on_haroolife_group() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.admin_events(kind, faitiere_id, title, body, link) VALUES (
    'haroolife.groupe', NEW.cooperative_id,
    CASE WHEN NEW.kind = 'team' THEN 'Nouvelle équipe HarooLife' ELSE 'Nouveau regroupement HarooLife' END,
    left('« ' || NEW.title || ' »' || coalesce(' pour ' || NEW.beneficiary, '') || ', début le '
      || to_char(NEW.starts_on, 'DD/MM') || '.', 300),
    '/haroolife');
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS admin_event_haroolife_group ON public.haroolife_groups;
CREATE TRIGGER admin_event_haroolife_group AFTER INSERT ON public.haroolife_groups
  FOR EACH ROW EXECUTE FUNCTION private.on_haroolife_group();
REVOKE ALL ON FUNCTION private.on_agronome_dossier(), private.on_haroolife_group() FROM PUBLIC, anon, authenticated;

-- Résumé HarooLife pour la console (service_role uniquement).
CREATE OR REPLACE FUNCTION public.admin_activity_haroolife()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH cfg AS (SELECT * FROM public.haroolife_pilot WHERE singleton),
  g AS (
    SELECT gr.*, coalesce((SELECT sum(x.amount) FROM public.haroolife_participations x
      WHERE x.group_id = gr.id AND x.left_at IS NULL), 0) AS total
    FROM public.haroolife_groups gr, cfg
    WHERE gr.cooperative_id = cfg.cooperative_id AND gr.cancelled_at IS NULL)
  SELECT jsonb_build_object(
    'enabled', cfg.enabled,
    'cooperative_id', cfg.cooperative_id,
    'cooperative', (SELECT name FROM public.cooperatives WHERE id = cfg.cooperative_id),
    'canton', (SELECT name FROM public.cantons WHERE id = cfg.canton_id),
    'workers_available', (SELECT count(DISTINCT w.id) FROM public.haroo_ouvrier_profiles w
      JOIN public.haroo_ouvrier_cantons c ON c.ouvrier_id = w.id
      WHERE w.disponible AND c.canton_id = cfg.canton_id),
    'producers_with_account', (SELECT count(DISTINCT m.id) FROM public.members m
      JOIN public.parcelles pa ON pa.member_id = m.id
      JOIN auth.users u ON lower(u.email) = lower(m.email)
      WHERE m.cooperative_id = cfg.cooperative_id AND pa.superficie_ha > 0),
    'recruiters', (SELECT count(*) FROM public.haroo_agronome_profiles a
      WHERE a.badge_valide OR a.statut_validation = 'VALIDE'),
    'groups_open', (SELECT count(*) FROM g WHERE g.expires_at > now() AND g.total < g.target),
    'groups_ready', (SELECT count(*) FROM g WHERE g.expires_at > now() AND g.total >= g.target),
    'groups_new_24h', (SELECT count(*) FROM g WHERE g.created_at > now() - interval '24 hours'),
    'groups_expiring_12h', (SELECT count(*) FROM g WHERE g.total < g.target
      AND g.expires_at > now() AND g.expires_at < now() + interval '12 hours'))
  FROM cfg;
$$;

-- Derniers événements visibles par un compte (mêmes règles que l'envoi).
CREATE OR REPLACE FUNCTION public.admin_recent_events(p_user uuid, p_limit integer DEFAULT 10)
RETURNS TABLE(id bigint, kind text, title text, body text, link text, created_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT e.id, e.kind, e.title, e.body, e.link, e.created_at FROM public.admin_events e
  WHERE p_user IN (SELECT public.admin_event_recipients(e.kind, e.faitiere_id))
  ORDER BY e.id DESC LIMIT least(greatest(p_limit, 1), 50);
$$;
REVOKE ALL ON FUNCTION public.admin_activity_haroolife(), public.admin_recent_events(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_activity_haroolife(), public.admin_recent_events(uuid, integer) TO service_role;
