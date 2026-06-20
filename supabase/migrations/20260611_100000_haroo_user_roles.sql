-- ─────────────────────────────────────────────────────────────────────────────
-- Rôles utilisateurs Haroo (professionnels agricoles)
--
-- Les utilisateurs Haroo (OUVRIER / ACHETEUR / AGRONOME) sont créés dans le
-- même auth.users que FaîtiereHub, via le backend AgriTogo
-- (POST /api/v1/haroo/auth/register). Le trigger handle_new_user crée la ligne
-- public.profiles avec role='member' ; AgriTogo promeut ensuite le rôle vers
-- l'une des valeurs ci-dessous.
--
-- NB : ALTER TYPE ... ADD VALUE doit être appliqué dans une migration séparée
-- des tables qui l'utilisent (PostgreSQL interdit l'usage d'une nouvelle
-- valeur d'enum dans la même transaction).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'ouvrier';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'acheteur';
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'agronome';
