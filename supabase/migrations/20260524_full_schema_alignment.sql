-- =============================================================================
-- FaîtiereHub — Full schema alignment migration
--
-- This migration brings the production database in line with what the frontend
-- code expects. It's IDEMPOTENT: safe to run multiple times.
--
-- Sections:
--   1. Add missing columns to existing tables (members, cooperatives)
--   2. Create geographic tables (regions, prefectures, communes, cantons, villages)
--   3. Create core domain tables (cultures, fiches_techniques, parcelles, etc.)
--   4. Create kobo integration tables
--   5. Add foreign keys to members for canton_id / prefecture_id / region_id
--   6. Grant anon access to public reference tables
--   7. RLS policies (basic)
--   8. verify_card RPC function
--
-- Apply via: Supabase SQL Editor (run the entire file at once)
-- =============================================================================

-- =============================================================================
-- 1. Add missing columns to existing tables
-- =============================================================================

-- members: add location and profile fields
ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS photo_url   text,
  ADD COLUMN IF NOT EXISTS village     text,
  ADD COLUMN IF NOT EXISTS canton      text,
  ADD COLUMN IF NOT EXISTS prefecture  text,
  ADD COLUMN IF NOT EXISTS region      text,
  ADD COLUMN IF NOT EXISTS canton_id      uuid,
  ADD COLUMN IF NOT EXISTS prefecture_id  uuid,
  ADD COLUMN IF NOT EXISTS region_id      uuid;

-- cooperatives: add hierarchy + branding fields
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS faitiere_name  text,
  ADD COLUMN IF NOT EXISTS level          text,
  ADD COLUMN IF NOT EXISTS parent_id      uuid REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS logo_url       text,
  ADD COLUMN IF NOT EXISTS primary_color  text,
  ADD COLUMN IF NOT EXISTS description    text;

-- member_cards: add qr_data if missing
ALTER TABLE public.member_cards
  ADD COLUMN IF NOT EXISTS qr_data text;

-- =============================================================================
-- 2. Geographic tables (Togo administrative divisions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.regions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  code        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prefectures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id   uuid NOT NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  name        text NOT NULL,
  code        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (region_id, name)
);

CREATE TABLE IF NOT EXISTS public.communes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefecture_id   uuid NOT NULL REFERENCES public.prefectures(id) ON DELETE CASCADE,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefecture_id, name)
);

CREATE TABLE IF NOT EXISTS public.cantons (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefecture_id   uuid NOT NULL REFERENCES public.prefectures(id) ON DELETE CASCADE,
  commune_id      uuid REFERENCES public.communes(id) ON DELETE SET NULL,
  name            text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prefecture_id, name)
);

CREATE TABLE IF NOT EXISTS public.villages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  canton_id   uuid NOT NULL REFERENCES public.cantons(id) ON DELETE CASCADE,
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (canton_id, name)
);

-- =============================================================================
-- 3. Core domain tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.cultures (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL UNIQUE,
  icon        text,
  category    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.fiches_techniques (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id      uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  title               text NOT NULL,
  description         text,
  culture             text NOT NULL,
  type_agriculture    text,
  campaign            text,
  region_id           uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  prefecture_id       uuid REFERENCES public.prefectures(id) ON DELETE SET NULL,
  canton_id           uuid REFERENCES public.cantons(id) ON DELETE SET NULL,
  files               jsonb NOT NULL DEFAULT '[]'::jsonb,
  status              text NOT NULL DEFAULT 'published',
  is_free_for_members boolean NOT NULL DEFAULT true,
  price_non_member    integer NOT NULL DEFAULT 500,
  currency            text NOT NULL DEFAULT 'XOF',
  download_count      integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fiches_cooperative ON public.fiches_techniques(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_fiches_status ON public.fiches_techniques(status);
CREATE INDEX IF NOT EXISTS idx_fiches_culture ON public.fiches_techniques(culture);

CREATE TABLE IF NOT EXISTS public.parcelles (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  cooperative_id      uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  culture_principale  text,
  superficie_ha       numeric(10, 4),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.productions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parcelle_id   uuid NOT NULL REFERENCES public.parcelles(id) ON DELETE CASCADE,
  campaign      text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cotisations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  cooperative_id uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  campaign      text,
  status        text NOT NULL DEFAULT 'pending',
  amount        integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchases (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fiche_id        uuid NOT NULL REFERENCES public.fiches_techniques(id) ON DELETE CASCADE,
  buyer_email     text,
  buyer_phone     text,
  amount          integer NOT NULL,
  currency        text NOT NULL DEFAULT 'XOF',
  payment_status  text NOT NULL DEFAULT 'pending',
  access_granted  boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.member_access_logs (
  id              bigserial PRIMARY KEY,
  card_number     text,
  member_id       uuid REFERENCES public.members(id) ON DELETE SET NULL,
  cooperative_id  uuid REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  fiche_id        uuid REFERENCES public.fiches_techniques(id) ON DELETE SET NULL,
  action          text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contact_requests (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'new',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Marketplace products (kept for future product marketplace use)
CREATE TABLE IF NOT EXISTS public.marketplace_products (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id       uuid REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  name                 text NOT NULL,
  description          text,
  category             text,
  culture              text,
  price                numeric(12, 2),
  currency             text NOT NULL DEFAULT 'XOF',
  unit                 text,
  quantity_available   integer,
  images               jsonb NOT NULL DEFAULT '[]'::jsonb,
  certification        text[],
  season               text,
  producer_type        text,
  available            boolean NOT NULL DEFAULT true,
  region_id            uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  prefecture_id        uuid REFERENCES public.prefectures(id) ON DELETE SET NULL,
  views_count          integer NOT NULL DEFAULT 0,
  orders_count         integer NOT NULL DEFAULT 0,
  created_at           timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. Kobo integration tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.kobo_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id      uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  member_id           uuid REFERENCES public.members(id) ON DELETE SET NULL,
  kobo_instance_id    text NOT NULL,
  kobo_form_id        text NOT NULL,
  member_card_number  text,
  status              text NOT NULL DEFAULT 'pending',
  error_message       text,
  raw_payload         jsonb,
  processed_payload   jsonb,
  matched_at          timestamptz,
  processed_at        timestamptz,
  submitted_at        timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kobo_instance_id, cooperative_id)
);

CREATE TABLE IF NOT EXISTS public.kobo_sync_logs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id  uuid REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  integration_id  uuid REFERENCES public.integrations(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending',
  details         jsonb,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz
);

CREATE TABLE IF NOT EXISTS public.kobo_field_mappings (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id  uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  form_id         text NOT NULL,
  kobo_field      text NOT NULL,
  target_table    text NOT NULL,
  target_column   text NOT NULL,
  transform_fn    text,
  is_key_field    boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. Add FKs on members location columns (safe — they're nullable)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_canton_id_fkey'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_canton_id_fkey
      FOREIGN KEY (canton_id) REFERENCES public.cantons(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_prefecture_id_fkey'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_prefecture_id_fkey
      FOREIGN KEY (prefecture_id) REFERENCES public.prefectures(id) ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'members_region_id_fkey'
  ) THEN
    ALTER TABLE public.members
      ADD CONSTRAINT members_region_id_fkey
      FOREIGN KEY (region_id) REFERENCES public.regions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- =============================================================================
-- 6. Grant anon read access to public reference tables
-- =============================================================================

GRANT SELECT ON public.regions       TO anon, authenticated;
GRANT SELECT ON public.prefectures   TO anon, authenticated;
GRANT SELECT ON public.communes      TO anon, authenticated;
GRANT SELECT ON public.cantons       TO anon, authenticated;
GRANT SELECT ON public.villages      TO anon, authenticated;
GRANT SELECT ON public.cultures      TO anon, authenticated;

-- =============================================================================
-- 7. Basic RLS policies for new tables
-- =============================================================================

ALTER TABLE public.regions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prefectures   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.communes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cantons       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.villages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cultures      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiches_techniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketplace_products ENABLE ROW LEVEL SECURITY;

-- Public read for reference tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read regions' AND tablename = 'regions') THEN
    CREATE POLICY "Public read regions" ON public.regions FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read prefectures' AND tablename = 'prefectures') THEN
    CREATE POLICY "Public read prefectures" ON public.prefectures FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read communes' AND tablename = 'communes') THEN
    CREATE POLICY "Public read communes" ON public.communes FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read cantons' AND tablename = 'cantons') THEN
    CREATE POLICY "Public read cantons" ON public.cantons FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read villages' AND tablename = 'villages') THEN
    CREATE POLICY "Public read villages" ON public.villages FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read cultures' AND tablename = 'cultures') THEN
    CREATE POLICY "Public read cultures" ON public.cultures FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read published fiches' AND tablename = 'fiches_techniques') THEN
    CREATE POLICY "Public read published fiches" ON public.fiches_techniques
      FOR SELECT USING (status = 'published');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Coop admin manage fiches' AND tablename = 'fiches_techniques') THEN
    CREATE POLICY "Coop admin manage fiches" ON public.fiches_techniques
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM public.profiles p
          WHERE p.id = auth.uid()
          AND (p.role = 'super_admin' OR p.cooperative_id = fiches_techniques.cooperative_id)
        )
      );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Public read available products' AND tablename = 'marketplace_products') THEN
    CREATE POLICY "Public read available products" ON public.marketplace_products
      FOR SELECT USING (available = true);
  END IF;
END $$;

-- =============================================================================
-- 8. verify_card RPC function (final version with all fields)
-- =============================================================================

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

COMMENT ON FUNCTION public.verify_card(text[]) IS
'Public card verification used by /verify/[card_number]. SECURITY DEFINER bypasses anon REVOKE on members. Returns only public fields.';
