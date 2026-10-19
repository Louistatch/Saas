-- Messages d'assistance depuis les tableaux de bord : routés au super_admin et aux opérateurs
-- de la zone de l'expéditeur (mandat actif sur sa coopérative, son union ou sa faîtière).
-- L'expéditeur n'est jamais destinataire de son propre message. Additif.
ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cooperative_id uuid REFERENCES public.cooperatives(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS contact_messages_coop ON public.contact_messages(cooperative_id) WHERE cooperative_id IS NOT NULL;

-- Une organisation et ses parents (union, faîtière), profondeur bornée contre les cycles.
CREATE OR REPLACE FUNCTION public.coop_lineage(p_coop uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  WITH RECURSIVE up(id, parent_id, depth) AS (
    SELECT c.id, c.parent_id, 0 FROM public.cooperatives c WHERE c.id = p_coop
    UNION ALL
    SELECT c.id, c.parent_id, up.depth + 1 FROM public.cooperatives c JOIN up ON c.id = up.parent_id
    WHERE up.depth < 10)
  SELECT id FROM up;
$$;

-- Opérateurs certifiés ayant un mandat actif sur la zone d'une organisation, hors expéditeur.
CREATE OR REPLACE FUNCTION public.support_zone_operators(p_coop uuid, p_exclude uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT DISTINCT m.user_id FROM public.partner_organization_assignments a
    JOIN public.partners pa ON pa.id = a.partner_id
    JOIN public.partner_memberships m ON m.partner_id = pa.id
    JOIN public.partner_certifications c ON c.partner_id = pa.id AND c.user_id = m.user_id
  WHERE a.cooperative_id IN (SELECT public.coop_lineage(p_coop))
    AND a.status = 'active' AND a.started_at <= now() AND (a.ended_at IS NULL OR a.ended_at > now())
    AND m.status = 'active' AND pa.status IN ('certified','active') AND c.certified_at IS NOT NULL
    AND m.user_id IS DISTINCT FROM p_exclude;
$$;

-- Messages d'assistance visibles par un opérateur : ceux de sa zone, jamais les siens.
CREATE OR REPLACE FUNCTION public.operator_support_messages(p_user uuid, p_status text)
RETURNS TABLE(id uuid, name text, email text, category text, subject text, message text,
  status text, created_at timestamptz, cooperative_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT cm.id, cm.name, cm.email, cm.category, cm.subject, cm.message, cm.status, cm.created_at,
    (SELECT name FROM public.cooperatives WHERE id = cm.cooperative_id)
  FROM public.contact_messages cm
  WHERE cm.category LIKE 'support:%' AND cm.status = p_status AND cm.cooperative_id IS NOT NULL
    AND cm.user_id IS DISTINCT FROM p_user
    AND p_user IN (SELECT public.support_zone_operators(cm.cooperative_id, cm.user_id))
  ORDER BY cm.created_at DESC LIMIT 100;
$$;

REVOKE ALL ON FUNCTION public.coop_lineage(uuid), public.support_zone_operators(uuid, uuid),
  public.operator_support_messages(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.coop_lineage(uuid), public.support_zone_operators(uuid, uuid),
  public.operator_support_messages(uuid, text) TO service_role;
