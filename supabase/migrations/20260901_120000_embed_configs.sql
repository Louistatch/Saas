-- ────────────────────────────────────────────────────────────
-- Embed configuration — app/dashboard/embed/page.tsx (settings UI)
-- and app/api/embed/route.ts (public widget API) both read/write
-- `embed_configs`, but the table was never created. Every save on
-- the settings page has failed silently, and the public embed API
-- has always returned "Embed not configured" for every cooperative.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.embed_configs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id   uuid NOT NULL UNIQUE REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  enabled          boolean NOT NULL DEFAULT false,
  allowed_origins  text[] NOT NULL DEFAULT '{}',
  widgets          text[] NOT NULL DEFAULT '{marketplace,member_verify,fiches,dashboard}',
  custom_domain    text,
  theme            jsonb NOT NULL DEFAULT '{"primaryColor":"#16a34a","borderRadius":"8px","fontFamily":"Inter"}'::jsonb,
  logo_url         text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_embed_configs_cooperative ON public.embed_configs(cooperative_id);

ALTER TABLE public.embed_configs ENABLE ROW LEVEL SECURITY;

-- Public read: the embed widget API is called anonymously from third-party
-- sites and must be able to look up a cooperative's config by id.
CREATE POLICY "embed_configs_public_read" ON public.embed_configs
  FOR SELECT USING (true);

-- Cooperative admins manage their own config.
CREATE POLICY "embed_configs_own_coop_write" ON public.embed_configs
  FOR ALL TO authenticated
  USING (
    cooperative_id = ANY (get_accessible_cooperative_ids())
  )
  WITH CHECK (
    cooperative_id = ANY (get_accessible_cooperative_ids())
  );

CREATE OR REPLACE FUNCTION public.touch_embed_configs_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_embed_configs_updated_at ON public.embed_configs;
CREATE TRIGGER trg_embed_configs_updated_at
  BEFORE UPDATE ON public.embed_configs
  FOR EACH ROW EXECUTE FUNCTION public.touch_embed_configs_updated_at();
