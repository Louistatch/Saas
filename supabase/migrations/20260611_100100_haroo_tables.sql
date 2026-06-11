-- ─────────────────────────────────────────────────────────────────────────────
-- Tables Haroo — professionnels agricoles (OUVRIER / ACHETEUR / AGRONOME)
--
-- Données hébergées dans l'unique base Supabase partagée (FaîtiereHub +
-- AgriTogo + Haroo). Lues par :
--   • AgriTogo  — app/haroo/verify.py (vérification de carte) et
--                 app/haroo/auth.py (inscription / connexion)
--   • FaîtiereHub — proxy /api/verify/[card_number] → AgriTogo
--
-- RLS : lecture publique (vérification de carte) ; le titulaire peut mettre à
-- jour son propre profil ; toutes les écritures passent sinon par le
-- service_role (AgriTogo).
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Profils ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haroo_ouvrier_profiles (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number   text UNIQUE,
  first_name    text NOT NULL,
  last_name     text NOT NULL,
  phone         text,
  photo_url     text,
  competences   text[] NOT NULL DEFAULT '{}',
  disponible    boolean NOT NULL DEFAULT true,
  note_moyenne  numeric(3,2) NOT NULL DEFAULT 0,
  nombre_avis   integer NOT NULL DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS haroo_acheteur_profiles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number          text UNIQUE,
  first_name           text NOT NULL,
  last_name            text NOT NULL,
  phone                text,
  photo_url            text,
  type_acheteur        text,
  produits_interesses  text[] NOT NULL DEFAULT '{}',
  prefecture_id        uuid REFERENCES prefectures(id),
  created_at           timestamptz DEFAULT now(),
  updated_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS haroo_agronome_profiles (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  card_number        text UNIQUE,
  first_name         text NOT NULL,
  last_name          text NOT NULL,
  phone              text,
  photo_url          text,
  specialisations    text[] NOT NULL DEFAULT '{}',
  canton_id          uuid REFERENCES cantons(id),
  badge_valide       boolean NOT NULL DEFAULT false,
  statut_validation  text NOT NULL DEFAULT 'EN_ATTENTE'
    CHECK (statut_validation IN ('EN_ATTENTE', 'VALIDE', 'REJETE')),
  note_moyenne       numeric(3,2) NOT NULL DEFAULT 0,
  nombre_missions    integer NOT NULL DEFAULT 0,
  created_at         timestamptz DEFAULT now(),
  updated_at         timestamptz DEFAULT now()
);

-- ─── M2M localités ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haroo_ouvrier_cantons (
  ouvrier_id  uuid NOT NULL REFERENCES haroo_ouvrier_profiles(id) ON DELETE CASCADE,
  canton_id   uuid NOT NULL REFERENCES cantons(id) ON DELETE CASCADE,
  PRIMARY KEY (ouvrier_id, canton_id)
);

CREATE TABLE IF NOT EXISTS haroo_acheteur_cantons (
  acheteur_id  uuid NOT NULL REFERENCES haroo_acheteur_profiles(id) ON DELETE CASCADE,
  canton_id    uuid NOT NULL REFERENCES cantons(id) ON DELETE CASCADE,
  PRIMARY KEY (acheteur_id, canton_id)
);

-- ─── Activité ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS haroo_jobs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type_travail     text NOT NULL,
  description      text,
  canton_id        uuid REFERENCES cantons(id),
  date_debut       date,
  date_fin         date,
  salaire_horaire  numeric(10,2),
  nombre_postes    integer,
  statut           text NOT NULL DEFAULT 'OUVERTE'
    CHECK (statut IN ('OUVERTE', 'POURVUE', 'FERMEE')),
  created_by       uuid REFERENCES auth.users(id),
  created_at       timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS haroo_presales (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  culture              text NOT NULL,
  quantite_estimee     numeric(12,2),
  prix_par_tonne       numeric(12,2),
  date_recolte_prevue  date,
  description          text,
  canton_id            uuid REFERENCES cantons(id),
  statut               text NOT NULL DEFAULT 'DISPONIBLE'
    CHECK (statut IN ('DISPONIBLE', 'RESERVEE', 'VENDUE', 'ANNULEE')),
  created_by           uuid REFERENCES auth.users(id),
  created_at           timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS haroo_missions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agronome_id      uuid NOT NULL REFERENCES haroo_agronome_profiles(id) ON DELETE CASCADE,
  description      text,
  statut           text NOT NULL DEFAULT 'DEMANDE'
    CHECK (statut IN ('DEMANDE', 'EN_COURS', 'TERMINEE', 'ANNULEE')),
  budget_propose   numeric(12,2),
  date_debut       date,
  date_fin         date,
  exploitant_name  text,
  created_at       timestamptz DEFAULT now()
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_haroo_jobs_statut ON haroo_jobs (statut);
CREATE INDEX IF NOT EXISTS idx_haroo_jobs_canton ON haroo_jobs (canton_id);
CREATE INDEX IF NOT EXISTS idx_haroo_presales_statut ON haroo_presales (statut);
CREATE INDEX IF NOT EXISTS idx_haroo_presales_canton ON haroo_presales (canton_id);
CREATE INDEX IF NOT EXISTS idx_haroo_missions_agronome ON haroo_missions (agronome_id, statut);

-- ─── RLS ─────────────────────────────────────────────────────────────────────

ALTER TABLE haroo_ouvrier_profiles  ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_acheteur_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_agronome_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_ouvrier_cantons   ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_acheteur_cantons  ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_jobs              ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_presales          ENABLE ROW LEVEL SECURITY;
ALTER TABLE haroo_missions          ENABLE ROW LEVEL SECURITY;

-- Lecture publique : nécessaire à la vérification de carte (QR scan anonyme).
CREATE POLICY "haroo_ouvrier_profiles_public_read"  ON haroo_ouvrier_profiles  FOR SELECT USING (true);
CREATE POLICY "haroo_acheteur_profiles_public_read" ON haroo_acheteur_profiles FOR SELECT USING (true);
CREATE POLICY "haroo_agronome_profiles_public_read" ON haroo_agronome_profiles FOR SELECT USING (true);
CREATE POLICY "haroo_ouvrier_cantons_public_read"   ON haroo_ouvrier_cantons   FOR SELECT USING (true);
CREATE POLICY "haroo_acheteur_cantons_public_read"  ON haroo_acheteur_cantons  FOR SELECT USING (true);
CREATE POLICY "haroo_jobs_public_read"              ON haroo_jobs              FOR SELECT USING (true);
CREATE POLICY "haroo_presales_public_read"          ON haroo_presales          FOR SELECT USING (true);
CREATE POLICY "haroo_missions_public_read"          ON haroo_missions          FOR SELECT USING (true);

-- Le titulaire peut mettre à jour son propre profil.
CREATE POLICY "haroo_ouvrier_profiles_own_update" ON haroo_ouvrier_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "haroo_acheteur_profiles_own_update" ON haroo_acheteur_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "haroo_agronome_profiles_own_update" ON haroo_agronome_profiles
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Toutes les autres écritures passent par le service_role (AgriTogo), qui
-- contourne RLS — aucune policy INSERT/DELETE publique n'est donc créée.
