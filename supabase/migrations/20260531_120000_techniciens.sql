-- =============================================================================
-- 20260531_120000_techniciens.sql
--
-- Module "Appeler un technicien".
--
-- Règles métier :
--   - Un technicien = 1 par (faîtière + canton). UNIQUE(faitiere_id, canton_id).
--   - Un producteur ne peut joindre que le technicien de SON canton, et
--     uniquement dans SA faîtière (jamais une autre faîtière).
--   - Chaque faîtière a un SE/Coordonnateur joignable par tous ses producteurs.
--
-- Idempotent. Apply via Supabase SQL editor ou `supabase db push`.
-- =============================================================================

-- 1. Coordonnées du SE/Coordonnateur sur la faîtière (cooperatives.level='faitiere')
ALTER TABLE public.cooperatives
  ADD COLUMN IF NOT EXISTS coordo_name  text,
  ADD COLUMN IF NOT EXISTS coordo_phone text;

-- 2. Table des techniciens
CREATE TABLE IF NOT EXISTS public.techniciens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  faitiere_id  uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  canton_id    uuid NOT NULL REFERENCES public.cantons(id) ON DELETE CASCADE,
  name         text NOT NULL,
  phone        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  -- Un seul technicien par couple (faîtière, canton).
  CONSTRAINT uq_technicien_faitiere_canton UNIQUE (faitiere_id, canton_id)
);

-- Index de lecture chaude : la page verify filtre par (faitiere_id, canton_id).
CREATE INDEX IF NOT EXISTS idx_techniciens_faitiere_canton
  ON public.techniciens (faitiere_id, canton_id);

COMMENT ON TABLE public.techniciens IS
  'Techniciens agricoles : 1 par (faîtière, canton). Joignable par les producteurs de ce canton.';

-- 3. RLS
ALTER TABLE public.techniciens ENABLE ROW LEVEL SECURITY;

-- Lecture publique (la page verify est publique/anon — le producteur doit pouvoir
-- voir le contact de son technicien sans être authentifié).
DROP POLICY IF EXISTS techniciens_public_read ON public.techniciens;
CREATE POLICY techniciens_public_read
  ON public.techniciens FOR SELECT
  USING (true);

-- Écriture : seulement par un admin de la faîtière concernée (ou super_admin).
DROP POLICY IF EXISTS techniciens_admin_write ON public.techniciens;
CREATE POLICY techniciens_admin_write
  ON public.techniciens FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.role = 'cooperative_admin' AND p.cooperative_id = techniciens.faitiere_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid()
        AND (
          p.role = 'super_admin'
          OR (p.role = 'cooperative_admin' AND p.cooperative_id = techniciens.faitiere_id)
        )
    )
  );

-- 4. Numéro SE/Coordo de FENOMAT (faîtière de démarrage)
UPDATE public.cooperatives
SET coordo_phone = COALESCE(coordo_phone, '92548838'),
    coordo_name  = COALESCE(coordo_name, 'SE / Coordonnateur FENOMAT')
WHERE level = 'faitiere'
  AND upper(name) LIKE '%FENOMAT%';

-- 5. trigger updated_at
CREATE OR REPLACE FUNCTION public.touch_techniciens_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_techniciens_updated_at ON public.techniciens;
CREATE TRIGGER trg_techniciens_updated_at
  BEFORE UPDATE ON public.techniciens
  FOR EACH ROW EXECUTE FUNCTION public.touch_techniciens_updated_at();

NOTIFY pgrst, 'reload schema';
