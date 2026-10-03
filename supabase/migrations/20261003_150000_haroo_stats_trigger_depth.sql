-- Les compteurs agronome (nombre_missions, note_moyenne) n'étaient jamais
-- recalculés : protect_haroo_privileges remet les anciennes valeurs pour tout
-- rôle autre que service_role, y compris le recalcul automatique.
--
-- Exception ÉTROITE : ces deux compteurs peuvent changer seulement quand la
-- mise à jour vient d'un déclencheur (pg_trigger_depth() > 1), c'est-à-dire du
-- recalcul déclenché par haroo_missions. Un utilisateur ne peut pas créer de
-- déclencheur : il ne peut donc toujours pas modifier sa note ni son nombre de
-- missions. badge_valide, statut_validation, carte et user_id restent protégés.
-- CREATE OR REPLACE seulement : aucune suppression.

create or replace function public.protect_haroo_privileges()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if current_setting('role', true) = 'service_role' then
    return new;
  end if;

  new.user_id        := old.user_id;
  new.card_number    := old.card_number;
  new.member_card_id := old.member_card_id;

  if tg_table_name = 'haroo_ouvrier_profiles' then
    new.note_moyenne := old.note_moyenne;
    new.nombre_avis  := old.nombre_avis;
  elsif tg_table_name = 'haroo_agronome_profiles' then
    if pg_trigger_depth() <= 1 then
      new.note_moyenne    := old.note_moyenne;
      new.nombre_missions := old.nombre_missions;
    end if;
    new.badge_valide      := old.badge_valide;
    new.statut_validation := old.statut_validation;
  end if;

  return new;
end;
$function$;

-- Recalcul initial : une mise à jour neutre des missions déclenche le calcul
-- (profondeur 2 dans le déclencheur de protection).
update public.haroo_missions set updated_at = updated_at;
