-- Retour arrière du pilote HarooLife. NE PAS placer dans supabase/migrations.
-- Ne touche que les objets créés par 20261010_160000_haroolife_pilot.sql.
-- Détruit les groupes préparatoires du pilote (sans contrat ni paiement). Sauvegarder au besoin avant exécution.
DROP FUNCTION IF EXISTS public.haroolife_command(text,uuid,jsonb);
DROP FUNCTION IF EXISTS public.haroolife_board();
DROP FUNCTION IF EXISTS private.haroolife_access();
DROP TABLE IF EXISTS public.haroolife_events;
DROP TABLE IF EXISTS public.haroolife_participations;
DROP TABLE IF EXISTS public.haroolife_groups;
DROP TABLE IF EXISTS public.haroolife_pilot;
