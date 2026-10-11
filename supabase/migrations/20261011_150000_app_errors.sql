-- Suivi des erreurs dans l'administration : chaque erreur (serveur ou navigateur) est regroupée
-- par empreinte, comptée, et traitée par le super_admin (nouvelle → résolue ; rouverte si elle
-- revient). Additif. service_role uniquement.
CREATE TABLE IF NOT EXISTS public.app_errors (
  fingerprint text PRIMARY KEY CHECK (length(fingerprint) <= 64),
  source text NOT NULL CHECK (source IN ('serveur','navigateur')),
  route text NOT NULL CHECK (length(route) <= 300),
  message text NOT NULL CHECK (length(message) <= 500),
  digest text CHECK (digest IS NULL OR length(digest) <= 100),
  occurrences integer NOT NULL DEFAULT 1,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'nouvelle' CHECK (status IN ('nouvelle','resolue')),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS app_errors_open ON public.app_errors(last_seen DESC) WHERE status = 'nouvelle';
ALTER TABLE public.app_errors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_errors FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.app_errors TO service_role;

CREATE OR REPLACE FUNCTION public.record_app_error(
  p_fingerprint text, p_source text, p_route text, p_message text, p_digest text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO public.app_errors(fingerprint, source, route, message, digest)
  VALUES (left(p_fingerprint, 64), p_source, left(p_route, 300), left(p_message, 500), left(p_digest, 100))
  ON CONFLICT (fingerprint) DO UPDATE SET
    occurrences = public.app_errors.occurrences + 1,
    last_seen = now(),
    digest = coalesce(excluded.digest, public.app_errors.digest),
    -- Une erreur résolue qui revient est rouverte.
    status = 'nouvelle',
    resolved_at = NULL,
    resolved_by = NULL;
$$;
REVOKE ALL ON FUNCTION public.record_app_error(text, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_app_error(text, text, text, text, text) TO service_role;
