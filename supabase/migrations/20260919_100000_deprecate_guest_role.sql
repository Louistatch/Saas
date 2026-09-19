-- ─────────────────────────────────────────────────────────────────────────────
-- Déprécier `guest` au profit de `none`
--
-- Depuis le passage au compte à deux couches, `guest` et `none` disent la même
-- chose : aucune couche organisationnelle. Garder les deux invite à des gardes
-- qui n'en couvrent qu'un — le genre d'oubli qui ouvre un accès sans qu'on le
-- voie — et `none` est la valeur que pose désormais handle_new_user().
--
-- Vérifié avant bascule : aucune policy RLS ne référence 'guest'. Les comptes
-- concernés ne perdent donc aucun accès.
--
-- La valeur reste dans l'enum : Postgres ne sait pas retirer un label. Elle est
-- dépréciée par commentaire, comme ouvrier/acheteur/agronome.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE profiles SET role = 'none'::user_role WHERE role = 'guest'::user_role;

COMMENT ON COLUMN profiles.role IS
  'Couche organisationnelle uniquement. Valeurs dépréciées, jamais à écrire : guest (utiliser none), ouvrier/acheteur/agronome (utiliser profiles.haroo_type).';

-- Le garde-fou posé à l'étape B tolérait `guest` sans organisation. Devenu
-- inutile maintenant qu'aucun compte ne le porte.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_org_role_needs_cooperative;
ALTER TABLE profiles ADD CONSTRAINT profiles_org_role_needs_cooperative
  CHECK (
    role IN ('none'::user_role, 'super_admin'::user_role)
    OR cooperative_id IS NOT NULL
  ) NOT VALID;
