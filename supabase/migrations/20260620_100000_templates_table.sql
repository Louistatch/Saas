-- ────────────────────────────────────────────────────────────
-- Modèles / Templates page — table + storage bucket policy
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id  uuid NOT NULL REFERENCES public.cooperatives(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  category        text NOT NULL DEFAULT 'autre',
  culture         text,
  file_name       text NOT NULL,
  file_url        text NOT NULL,
  file_type       text NOT NULL DEFAULT 'pdf',
  file_size       bigint,
  download_count  integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_templates_cooperative ON public.templates(cooperative_id);
CREATE INDEX IF NOT EXISTS idx_templates_category    ON public.templates(category);

ALTER TABLE public.templates ENABLE ROW LEVEL SECURITY;

-- cooperative admins can manage their own templates
CREATE POLICY "templates_admin_all" ON public.templates
  FOR ALL
  USING (
    cooperative_id IN (SELECT get_accessible_cooperative_ids())
  )
  WITH CHECK (
    cooperative_id IN (SELECT get_accessible_cooperative_ids())
  );

-- members can view/download templates from their cooperative
CREATE POLICY "templates_member_read" ON public.templates
  FOR SELECT
  USING (
    cooperative_id IN (SELECT get_accessible_cooperative_ids())
  );

-- Storage bucket for template files (run via Supabase dashboard if not already created)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('templates', 'templates', false)
-- ON CONFLICT (id) DO NOTHING;

-- Storage RLS: allow cooperative admins to upload
CREATE POLICY "templates_storage_upload" ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'templates'
    AND auth.role() = 'authenticated'
  );

CREATE POLICY "templates_storage_read" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'templates' AND auth.role() = 'authenticated');

CREATE POLICY "templates_storage_delete" ON storage.objects
  FOR DELETE
  USING (bucket_id = 'templates' AND auth.role() = 'authenticated');
