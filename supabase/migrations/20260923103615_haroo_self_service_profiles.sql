-- Profil Haroo éditable par son titulaire, sans ouvrir les champs de confiance.
--
-- Deux choses manquaient pour qu'un ouvrier, un acheteur ou un agronome puisse
-- tenir son propre profil à jour :
--
--   1. `haroo_ouvrier_cantons` n'avait aucune policy d'écriture. Les cantons de
--      disponibilité ne pouvaient donc être posés que par le service_role, et
--      en pratique ils ne l'étaient jamais — ce qui rendait le tri « offres
--      dans votre canton » structurellement vide.
--
--   2. Les policies `*_own_update` autorisent la mise à jour de TOUTES les
--      colonnes de sa propre ligne, y compris `card_number`, `badge_valide` et
--      `statut_validation`. Un titulaire pouvait donc s'auto-attribuer un
--      numéro de carte ou un badge d'agronome validé. Le trigger ci-dessous
--      referme ce trou : les colonnes de confiance restent la prérogative du
--      service_role et des fonctions SECURITY DEFINER.

-- ── 1. Cantons de disponibilité de l'ouvrier ────────────────────────────────

DROP POLICY IF EXISTS "haroo_ouvrier_cantons_own_write" ON public.haroo_ouvrier_cantons;
CREATE POLICY "haroo_ouvrier_cantons_own_write" ON public.haroo_ouvrier_cantons
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.haroo_ouvrier_profiles p
      WHERE p.id = haroo_ouvrier_cantons.ouvrier_id
        AND p.user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.haroo_ouvrier_profiles p
      WHERE p.id = haroo_ouvrier_cantons.ouvrier_id
        AND p.user_id = (SELECT auth.uid())
    )
  );

GRANT INSERT, DELETE ON public.haroo_ouvrier_cantons TO authenticated;

-- ── 2. Colonnes de confiance ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.protect_haroo_privileges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- service_role et fonctions SECURITY DEFINER : l'émission de carte et la
  -- validation de badge passent par là, elles gardent la main.
  IF current_setting('role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;

  NEW.user_id        := OLD.user_id;
  NEW.card_number    := OLD.card_number;
  NEW.member_card_id := OLD.member_card_id;

  IF TG_TABLE_NAME = 'haroo_ouvrier_profiles' THEN
    NEW.note_moyenne := OLD.note_moyenne;
    NEW.nombre_avis  := OLD.nombre_avis;
  ELSIF TG_TABLE_NAME = 'haroo_agronome_profiles' THEN
    NEW.note_moyenne       := OLD.note_moyenne;
    NEW.nombre_missions    := OLD.nombre_missions;
    NEW.badge_valide       := OLD.badge_valide;
    NEW.statut_validation  := OLD.statut_validation;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_haroo_privileges ON public.haroo_ouvrier_profiles;
CREATE TRIGGER protect_haroo_privileges
  BEFORE UPDATE ON public.haroo_ouvrier_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_haroo_privileges();

DROP TRIGGER IF EXISTS protect_haroo_privileges ON public.haroo_acheteur_profiles;
CREATE TRIGGER protect_haroo_privileges
  BEFORE UPDATE ON public.haroo_acheteur_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_haroo_privileges();

DROP TRIGGER IF EXISTS protect_haroo_privileges ON public.haroo_agronome_profiles;
CREATE TRIGGER protect_haroo_privileges
  BEFORE UPDATE ON public.haroo_agronome_profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_haroo_privileges();

COMMENT ON FUNCTION public.protect_haroo_privileges() IS
  'Empêche un titulaire de profil Haroo de modifier ses propres champs de confiance (numéro de carte, badge, notes). Seul le service_role le peut.';
