-- ─────────────────────────────────────────────────────────────────────────────
-- Cartes professionnelles Haroo (OUVRIER / ACHETEUR / AGRONOME)
--
-- Les cartes Haroo vivent dans member_cards (même flux de vérification QR que
-- les cartes FAITIERE — voir AgriTogo app/haroo/verify.py), mais un
-- professionnel indépendant n'a ni coopérative ni fiche membre :
-- cooperative_id et member_id deviennent donc nullables, avec un garde-fou
-- pour que les cartes FAITIERE restent obligatoirement rattachées.
--
-- L'émission est réservée au super_admin (panneau /admin/haroo), après
-- validation du profil pour les agronomes. La policy member_cards_admin_write
-- couvre déjà l'insertion ; on ajoute l'écriture super_admin sur les profils
-- Haroo (jusqu'ici : lecture publique + own-update + service_role seulement)
-- pour pouvoir y reporter card_number et valider les agronomes.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE member_cards ALTER COLUMN cooperative_id DROP NOT NULL;
ALTER TABLE member_cards ALTER COLUMN member_id DROP NOT NULL;

ALTER TABLE member_cards ADD CONSTRAINT member_cards_faitiere_links
  CHECK (card_type <> 'FAITIERE' OR (cooperative_id IS NOT NULL AND member_id IS NOT NULL));

-- Écriture super_admin sur les profils Haroo (même forme que
-- member_cards_admin_write).
CREATE POLICY "haroo_ouvrier_profiles_admin_write" ON haroo_ouvrier_profiles
  FOR ALL USING (auth.uid() IN (
    SELECT profiles.id FROM profiles WHERE profiles.role = 'super_admin'::user_role
  ));
CREATE POLICY "haroo_acheteur_profiles_admin_write" ON haroo_acheteur_profiles
  FOR ALL USING (auth.uid() IN (
    SELECT profiles.id FROM profiles WHERE profiles.role = 'super_admin'::user_role
  ));
CREATE POLICY "haroo_agronome_profiles_admin_write" ON haroo_agronome_profiles
  FOR ALL USING (auth.uid() IN (
    SELECT profiles.id FROM profiles WHERE profiles.role = 'super_admin'::user_role
  ));
