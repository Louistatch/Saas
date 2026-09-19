-- Comptes de démo — l'admin doit pouvoir « jouer chaque rôle » pour voir le
-- site comme un membre, un ouvrier Haroo, un acheteur, un agronome, ou un
-- candidat Opérateur sans organisation (exactement le cas que
-- academy_profile_progress a été construit pour couvrir).
--
-- Choix explicite de l'utilisateur (le moins risqué) : jamais d'usurpation
-- d'un compte réel. is_demo marque des comptes synthétiques dédiés, créés
-- et gérés uniquement par lib/admin/demo-accounts.ts (service_role) ; un
-- lien de connexion n'est jamais généré que pour un profil is_demo = true,
-- vérifié côté serveur avant tout generateLink.

ALTER TABLE profiles ADD COLUMN is_demo boolean NOT NULL DEFAULT false;
ALTER TABLE cooperatives ADD COLUMN is_demo boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN profiles.is_demo IS
  'Compte synthétique créé par lib/admin/demo-accounts.ts pour que le super_admin puisse prévisualiser chaque rôle. Jamais un vrai utilisateur — condition nécessaire avant de générer un lien de connexion admin.';
COMMENT ON COLUMN cooperatives.is_demo IS
  'Coopérative synthétique support des comptes de démo membre/cooperative_admin — à exclure des statistiques plateforme si besoin.';
