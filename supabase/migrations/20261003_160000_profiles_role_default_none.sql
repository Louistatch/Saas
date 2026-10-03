-- La valeur par défaut 'member' contredisait profiles_org_role_needs_cooperative :
-- toute insertion sans rôle explicite (upsert d'AgriTogo pour Haroo) échouait
-- avec « Création du profil impossible ». 'none' = compte sans organisation,
-- la seule valeur valide sans coopérative. Appliquée le 2026-10-03.
alter table public.profiles alter column role set default 'none';
