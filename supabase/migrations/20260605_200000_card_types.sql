-- Add card_type to member_cards, create 3 profile tables + 6 activity tables

-- 1. card_type column
ALTER TABLE public.member_cards
  ADD COLUMN IF NOT EXISTS card_type TEXT NOT NULL DEFAULT 'FAITIERE'
  CHECK (card_type IN ('FAITIERE','OUVRIER','ACHETEUR','AGRONOME'));

CREATE INDEX IF NOT EXISTS idx_member_cards_type ON public.member_cards(card_type);

-- 2. ouvrier_profiles
CREATE TABLE IF NOT EXISTS public.ouvrier_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  competences TEXT[] DEFAULT '{}',
  cantons_disponibles TEXT[] DEFAULT '{}',
  disponible BOOLEAN DEFAULT true,
  disponible_jusqu_au DATE,
  tarif_journalier DECIMAL(10,2),
  note_moyenne DECIMAL(3,2) DEFAULT 0 CHECK (note_moyenne >= 0 AND note_moyenne <= 5),
  nombre_avis INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id)
);

-- 3. acheteur_profiles
CREATE TABLE IF NOT EXISTS public.acheteur_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  type_acheteur TEXT DEFAULT 'PARTICULIER'
    CHECK (type_acheteur IN ('PARTICULIER','ENTREPRISE','COOPERATIVE','EXPORTATEUR')),
  nom_organisation TEXT,
  produits_interesses TEXT[] DEFAULT '{}',
  cantons_intervention TEXT[] DEFAULT '{}',
  prefectures_intervention TEXT[] DEFAULT '{}',
  volume_annuel_tonnes DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id)
);

-- 4. agronome_profiles
CREATE TABLE IF NOT EXISTS public.agronome_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  specialisations TEXT[] DEFAULT '{}',
  canton TEXT,
  prefecture TEXT,
  region TEXT,
  badge_valide BOOLEAN DEFAULT false,
  statut_validation TEXT DEFAULT 'EN_ATTENTE'
    CHECK (statut_validation IN ('EN_ATTENTE','VALIDE','REJETE')),
  disponible_missions BOOLEAN DEFAULT true,
  note_moyenne DECIMAL(3,2) DEFAULT 0 CHECK (note_moyenne >= 0 AND note_moyenne <= 5),
  nombre_missions INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(card_id)
);

-- 5. offres_emploi (farmer posts → worker sees)
CREATE TABLE IF NOT EXISTS public.offres_emploi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploitant_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  culture TEXT,
  description TEXT,
  canton TEXT NOT NULL,
  prefecture TEXT,
  region TEXT,
  date_debut DATE,
  date_fin DATE,
  tarif_journalier DECIMAL(10,2),
  nombre_ouvriers INT DEFAULT 1,
  statut TEXT DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE','POURVUE','ANNULEE','EXPIREE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. candidatures_emploi
CREATE TABLE IF NOT EXISTS public.candidatures_emploi (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  offre_id UUID NOT NULL REFERENCES public.offres_emploi(id) ON DELETE CASCADE,
  ouvrier_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  message TEXT,
  statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE','ACCEPTEE','REFUSEE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(offre_id, ouvrier_card_id)
);

-- 7. missions (farmer posts → agronomist sees)
CREATE TABLE IF NOT EXISTS public.missions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploitant_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  culture TEXT,
  description TEXT,
  canton TEXT NOT NULL,
  prefecture TEXT,
  region TEXT,
  budget DECIMAL(12,2),
  date_souhaitee DATE,
  statut TEXT DEFAULT 'OUVERTE' CHECK (statut IN ('OUVERTE','EN_COURS','TERMINEE','ANNULEE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 8. candidatures_mission
CREATE TABLE IF NOT EXISTS public.candidatures_mission (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id UUID NOT NULL REFERENCES public.missions(id) ON DELETE CASCADE,
  agronome_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  message TEXT,
  tarif_propose DECIMAL(12,2),
  statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE','ACCEPTEE','REFUSEE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(mission_id, agronome_card_id)
);

-- 9. preventes (farmer posts → buyer sees)
CREATE TABLE IF NOT EXISTS public.preventes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exploitant_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  culture TEXT NOT NULL,
  quantite_estimee DECIMAL(10,2) NOT NULL,
  prix_par_kg DECIMAL(10,2) NOT NULL,
  date_recolte_prevue DATE NOT NULL,
  canton TEXT NOT NULL,
  prefecture TEXT,
  region TEXT,
  description TEXT,
  statut TEXT DEFAULT 'DISPONIBLE' CHECK (statut IN ('DISPONIBLE','ENGAGEE','LIVREE','ANNULEE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 10. engagements_prevente
CREATE TABLE IF NOT EXISTS public.engagements_prevente (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prevente_id UUID NOT NULL REFERENCES public.preventes(id) ON DELETE CASCADE,
  acheteur_card_id UUID NOT NULL REFERENCES public.member_cards(id) ON DELETE CASCADE,
  quantite_engagee DECIMAL(10,2) NOT NULL,
  message TEXT,
  statut TEXT DEFAULT 'EN_ATTENTE' CHECK (statut IN ('EN_ATTENTE','CONFIRME','ANNULE')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(prevente_id, acheteur_card_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ouvrier_profiles_card ON public.ouvrier_profiles(card_id);
CREATE INDEX IF NOT EXISTS idx_acheteur_profiles_card ON public.acheteur_profiles(card_id);
CREATE INDEX IF NOT EXISTS idx_agronome_profiles_card ON public.agronome_profiles(card_id);
CREATE INDEX IF NOT EXISTS idx_offres_emploi_canton ON public.offres_emploi(canton, statut);
CREATE INDEX IF NOT EXISTS idx_missions_canton ON public.missions(canton, statut);
CREATE INDEX IF NOT EXISTS idx_preventes_canton ON public.preventes(canton, statut);

-- RLS
ALTER TABLE public.ouvrier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acheteur_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agronome_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offres_emploi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatures_emploi ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.candidatures_mission ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements_prevente ENABLE ROW LEVEL SECURITY;

-- Public read (anon + authenticated) for verify endpoint
CREATE POLICY "anon_read_ouvrier_profiles" ON public.ouvrier_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_read_acheteur_profiles" ON public.acheteur_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_read_agronome_profiles" ON public.agronome_profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "anon_read_offres" ON public.offres_emploi FOR SELECT TO anon, authenticated USING (statut = 'OUVERTE');
CREATE POLICY "anon_read_missions" ON public.missions FOR SELECT TO anon, authenticated USING (statut = 'OUVERTE');
CREATE POLICY "anon_read_preventes" ON public.preventes FOR SELECT TO anon, authenticated USING (statut = 'DISPONIBLE');

-- Service role full access
CREATE POLICY "service_full_ouvrier" ON public.ouvrier_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_acheteur" ON public.acheteur_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_agronome" ON public.agronome_profiles FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_offres" ON public.offres_emploi FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_candidatures_emploi" ON public.candidatures_emploi FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_missions" ON public.missions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_candidatures_mission" ON public.candidatures_mission FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_preventes" ON public.preventes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_full_engagements" ON public.engagements_prevente FOR ALL TO service_role USING (true) WITH CHECK (true);
