-- ────────────────────────────────────────────────────────────
-- Contact page — public contact form submissions
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  email       text NOT NULL,
  category    text NOT NULL DEFAULT 'autre',
  subject     text NOT NULL,
  message     text NOT NULL,
  status      text NOT NULL DEFAULT 'nouveau',
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON public.contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages(status);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

-- Anyone can submit a contact message (public marketing form) — inserts only,
-- no read/update/delete. Validation and rate limiting happen in the API route.
CREATE POLICY "contact_messages_public_insert" ON public.contact_messages
  FOR INSERT
  WITH CHECK (true);

-- Only super_admin can read/manage submissions.
CREATE POLICY "contact_messages_admin_all" ON public.contact_messages
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );
