-- ────────────────────────────────────────────────────────────
-- Producer announcements — the table backing
-- app/api/verify/[card_number]/announcements/route.ts was never
-- created. The route (POST/GET), the domain model
-- (lib/announcements/models.ts) and the UI
-- (components/verify/exploitation-inline-view.tsx) have all existed
-- and been wired together, but every insert has failed since day
-- one — the table just didn't exist.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.producer_announcements (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  cooperative_id      uuid REFERENCES public.cooperatives(id) ON DELETE SET NULL,
  type                text NOT NULL CHECK (type IN ('job', 'prevente', 'autre')),
  title               text NOT NULL,
  description         text,
  culture             text,
  quantity_kg         numeric(12,2),
  price_per_kg_fcfa   numeric(12,2),
  location_canton     text,
  contact_phone       text,
  status              text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'closed', 'expired')),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_producer_announcements_member ON public.producer_announcements(member_id);
CREATE INDEX IF NOT EXISTS idx_producer_announcements_status ON public.producer_announcements(status);

ALTER TABLE public.producer_announcements ENABLE ROW LEVEL SECURITY;

-- Lecture publique : consultées depuis la page de vérification de carte
-- (scan QR anonyme), au même titre que haroo_jobs / haroo_presales.
CREATE POLICY "producer_announcements_public_read" ON public.producer_announcements
  FOR SELECT USING (true);

-- Écriture : uniquement via service_role (la route API utilise le client
-- admin après avoir résolu la carte), donc pas de policy INSERT/UPDATE
-- publique nécessaire — service_role bypass RLS.
CREATE POLICY "producer_announcements_admin_all" ON public.producer_announcements
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );
