-- Conversations d'assistance : réponses dans l'application (équipe, opérateur, utilisateur),
-- visibles dans le tableau de bord de l'expéditeur. Additif. service_role uniquement.
CREATE TABLE IF NOT EXISTS public.support_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES public.contact_messages(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  author_role text NOT NULL CHECK (author_role IN ('equipe','operateur','utilisateur')),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_replies_thread ON public.support_replies(message_id, created_at);
ALTER TABLE public.support_replies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_replies FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.support_replies TO service_role;

ALTER TABLE public.contact_messages
  ADD COLUMN IF NOT EXISTS last_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS user_last_read_at timestamptz;
CREATE INDEX IF NOT EXISTS contact_messages_user ON public.contact_messages(user_id, created_at DESC) WHERE user_id IS NOT NULL;
