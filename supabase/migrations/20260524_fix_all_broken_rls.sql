-- =============================================================================
-- FIX ALL — Répare les policies RLS cassées par l'audit de sécurité
--
-- L'audit a remplacé les policies FOR ALL par des versions sans WITH CHECK,
-- ce qui a silencieusement bloqué TOUS les INSERT/UPDATE depuis le dashboard.
--
-- Ce script :
-- 1. Corrige member_cards (INSERT/UPDATE/DELETE bloqués)
-- 2. Corrige members (INSERT/UPDATE bloqués)
-- 3. Corrige exploitations (INSERT/UPDATE bloqués)
-- 4. Corrige integrations (INSERT/UPDATE bloqués)
-- 5. Restaure l'accès anon pour verify_card RPC
-- 6. Force le reload du schema cache PostgREST
--
-- SAFE: Idempotent (DROP IF EXISTS + CREATE)
-- Apply via: Supabase SQL Editor
-- =============================================================================

-- =============================================================================
-- MEMBER_CARDS — Fix INSERT/UPDATE/DELETE
-- =============================================================================

DROP POLICY IF EXISTS "Coop admins can manage cards"            ON public.member_cards;
DROP POLICY IF EXISTS "Coop members can view their coop cards"  ON public.member_cards;
DROP POLICY IF EXISTS "Super admins manage all cards"           ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_select_coop"                ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_select_super_admin"         ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_insert_coop_admin"          ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_insert_super_admin"         ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_update_coop_admin"          ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_update_super_admin"         ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_delete_coop_admin"          ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_delete_super_admin"         ON public.member_cards;
DROP POLICY IF EXISTS "member_cards_anon_select_active"         ON public.member_cards;
DROP POLICY IF EXISTS "Public can view active cards"            ON public.member_cards;

ALTER TABLE public.member_cards ENABLE ROW LEVEL SECURITY;

-- Coop admins: full CRUD on their cooperative's cards
CREATE POLICY "member_cards_coop_admin_all"
  ON public.member_cards FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- Super admins: full CRUD on ALL cards
CREATE POLICY "member_cards_super_admin_all"
  ON public.member_cards FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Members: read their own coop's cards
CREATE POLICY "member_cards_member_select"
  ON public.member_cards FOR SELECT TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- Anon: read active cards only (for /verify QR scan)
GRANT SELECT ON public.member_cards TO anon;
CREATE POLICY "member_cards_anon_active"
  ON public.member_cards FOR SELECT TO anon
  USING (status = 'active');

-- =============================================================================
-- MEMBERS — Fix INSERT/UPDATE/DELETE
-- =============================================================================

DROP POLICY IF EXISTS "Coop admins can manage members"          ON public.members;
DROP POLICY IF EXISTS "Members can view own coop"               ON public.members;
DROP POLICY IF EXISTS "Super admins manage all members"         ON public.members;
DROP POLICY IF EXISTS "members_coop_admin_all"                  ON public.members;
DROP POLICY IF EXISTS "members_super_admin_all"                 ON public.members;
DROP POLICY IF EXISTS "members_member_select"                   ON public.members;

ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;

-- Coop admins: full CRUD on their cooperative's members
CREATE POLICY "members_coop_admin_all"
  ON public.members FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- Super admins: full CRUD on ALL members
CREATE POLICY "members_super_admin_all"
  ON public.members FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Members: read their own coop's members
CREATE POLICY "members_member_select"
  ON public.members FOR SELECT TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p WHERE p.id = auth.uid()
    )
  );

-- =============================================================================
-- EXPLOITATIONS — Fix INSERT/UPDATE/DELETE
-- =============================================================================

DROP POLICY IF EXISTS "Coop admins can manage exploitations"    ON public.exploitations;
DROP POLICY IF EXISTS "Public can view active exploitations"    ON public.exploitations;
DROP POLICY IF EXISTS "Super admins manage all exploitations"   ON public.exploitations;
DROP POLICY IF EXISTS "exploitations_coop_admin_all"            ON public.exploitations;
DROP POLICY IF EXISTS "exploitations_super_admin_all"           ON public.exploitations;
DROP POLICY IF EXISTS "exploitations_public_read"               ON public.exploitations;

ALTER TABLE public.exploitations ENABLE ROW LEVEL SECURITY;

-- Coop admins: full CRUD
CREATE POLICY "exploitations_coop_admin_all"
  ON public.exploitations FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- Super admins: full CRUD
CREATE POLICY "exploitations_super_admin_all"
  ON public.exploitations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Public: read active exploitations
GRANT SELECT ON public.exploitations TO anon;
CREATE POLICY "exploitations_public_read"
  ON public.exploitations FOR SELECT TO anon
  USING (active = true);

-- =============================================================================
-- INTEGRATIONS — Fix INSERT/UPDATE/DELETE
-- =============================================================================

DROP POLICY IF EXISTS "Coop admins can manage integrations"     ON public.integrations;
DROP POLICY IF EXISTS "Super admins manage all integrations"    ON public.integrations;
DROP POLICY IF EXISTS "integrations_coop_admin_all"             ON public.integrations;
DROP POLICY IF EXISTS "integrations_super_admin_all"            ON public.integrations;

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

-- Coop admins: full CRUD
CREATE POLICY "integrations_coop_admin_all"
  ON public.integrations FOR ALL TO authenticated
  USING (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  )
  WITH CHECK (
    cooperative_id IN (
      SELECT p.cooperative_id FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('cooperative_admin', 'super_admin')
    )
  );

-- Super admins: full CRUD
CREATE POLICY "integrations_super_admin_all"
  ON public.integrations FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- =============================================================================
-- FICHES_TECHNIQUES — Policies for the new table
-- =============================================================================

-- (Only if the table exists — created by the full_schema_alignment migration)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'fiches_techniques') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Public read published fiches" ON public.fiches_techniques';
    EXECUTE 'DROP POLICY IF EXISTS "Coop admin manage fiches" ON public.fiches_techniques';
    EXECUTE 'DROP POLICY IF EXISTS "fiches_public_read" ON public.fiches_techniques';
    EXECUTE 'DROP POLICY IF EXISTS "fiches_admin_all" ON public.fiches_techniques';

    EXECUTE 'ALTER TABLE public.fiches_techniques ENABLE ROW LEVEL SECURITY';

    -- Public: read published fiches
    EXECUTE '
      CREATE POLICY "fiches_public_read"
        ON public.fiches_techniques FOR SELECT
        USING (status = ''published'')
    ';

    -- Coop admins: full CRUD on their cooperative's fiches
    EXECUTE '
      CREATE POLICY "fiches_admin_all"
        ON public.fiches_techniques FOR ALL TO authenticated
        USING (
          cooperative_id IN (
            SELECT p.cooperative_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN (''cooperative_admin'', ''super_admin'')
          )
        )
        WITH CHECK (
          cooperative_id IN (
            SELECT p.cooperative_id FROM public.profiles p
            WHERE p.id = auth.uid() AND p.role IN (''cooperative_admin'', ''super_admin'')
          )
        )
    ';

    -- Grant anon SELECT for public marketplace
    EXECUTE 'GRANT SELECT ON public.fiches_techniques TO anon';
  END IF;
END $$;

-- =============================================================================
-- COOPERATIVES — Ensure authenticated can read
-- =============================================================================

DROP POLICY IF EXISTS "Anyone can view cooperatives"            ON public.cooperatives;
DROP POLICY IF EXISTS "cooperatives_public_read"                ON public.cooperatives;
DROP POLICY IF EXISTS "cooperatives_admin_all"                  ON public.cooperatives;

ALTER TABLE public.cooperatives ENABLE ROW LEVEL SECURITY;

-- Everyone can read cooperatives (public info)
GRANT SELECT ON public.cooperatives TO anon;
CREATE POLICY "cooperatives_public_read"
  ON public.cooperatives FOR SELECT
  USING (true);

-- Super admins: full CRUD
CREATE POLICY "cooperatives_admin_all"
  ON public.cooperatives FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- =============================================================================
-- PROFILES — Ensure users can read their own profile (needed by all policies above)
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own profile"              ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile"            ON public.profiles;
DROP POLICY IF EXISTS "Super admins view all profiles"          ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_select"                     ON public.profiles;
DROP POLICY IF EXISTS "profiles_own_update"                     ON public.profiles;
DROP POLICY IF EXISTS "profiles_super_admin_all"                ON public.profiles;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Users read their own profile
CREATE POLICY "profiles_own_select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

-- Super admins read all profiles
CREATE POLICY "profiles_super_admin_all"
  ON public.profiles FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- Users update their own profile (but NOT role or cooperative_id)
CREATE POLICY "profiles_own_update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- =============================================================================
-- VERIFY_CARD RPC — Ensure it exists and is accessible
-- =============================================================================

DROP FUNCTION IF EXISTS public.verify_card(text[]);

CREATE OR REPLACE FUNCTION public.verify_card(p_card_numbers text[])
RETURNS TABLE (
  card_number       text,
  card_status       text,
  expiry_date       date,
  card_created_at   timestamptz,
  first_name        text,
  last_name         text,
  photo_url         text,
  village           text,
  canton            text,
  prefecture        text,
  region            text,
  member_status     text,
  member_since      timestamptz,
  cooperative_name  text,
  faitiere_name     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    mc.card_number,
    mc.status::text,
    mc.expiry_date,
    mc.created_at,
    m.first_name,
    m.last_name,
    m.photo_url,
    m.village,
    m.canton,
    m.prefecture,
    m.region,
    m.status::text,
    m.created_at,
    coop.name,
    coop.faitiere_name
  FROM member_cards mc
  JOIN members m         ON m.id = mc.member_id
  JOIN cooperatives coop ON coop.id = mc.cooperative_id
  WHERE mc.card_number = ANY(p_card_numbers)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_card(text[]) TO anon, authenticated;

-- =============================================================================
-- FORCE SCHEMA CACHE RELOAD
-- =============================================================================

NOTIFY pgrst, 'reload schema';
