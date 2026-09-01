-- ────────────────────────────────────────────────────────────
-- Fix contact_requests: the buyer→supplier contact form on
-- /fournisseurs/[memberId] (via POST /api/contact-request) has always
-- sent { member_id, buyer_name, message, buyer_phone }, but the table
-- only had { name, email, message, status } with name/email NOT NULL.
-- Every submission has been failing (missing columns + NOT NULL
-- violation on name). This adds the columns the form actually sends
-- and relaxes name/email to support both this flow and the generic
-- marketing /contact form that may use the same table pattern.
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.contact_requests
  ADD COLUMN IF NOT EXISTS member_id   uuid REFERENCES public.members(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS buyer_name  text,
  ADD COLUMN IF NOT EXISTS buyer_phone text;

ALTER TABLE public.contact_requests ALTER COLUMN name  DROP NOT NULL;
ALTER TABLE public.contact_requests ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contact_requests_member ON public.contact_requests(member_id);

DROP POLICY IF EXISTS "contact_requests_public_insert" ON public.contact_requests;
CREATE POLICY "contact_requests_public_insert"
  ON public.contact_requests FOR INSERT
  WITH CHECK (
    message IS NOT NULL AND length(message) >= 10
    AND (
      (name IS NOT NULL AND length(name) >= 2)
      OR (buyer_name IS NOT NULL AND length(buyer_name) >= 2)
    )
  );
