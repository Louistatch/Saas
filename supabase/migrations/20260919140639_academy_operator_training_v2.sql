-- AgriAcademy V2 — parcours « Opérateur certifié FaîtiereHub »
--
-- Reconstruction fidèle du schéma réellement appliqué en base (version
-- 20260919140639) après une compaction de session ayant perdu le brouillon
-- local d'origine. Contenu vérifié par introspection (information_schema,
-- pg_constraint, pg_indexes, pg_policies) plutôt que réécrit de mémoire.
--
-- Ne touche ni academy_modules ni academy_lessons (aucun CHECK élargi) :
-- le module Opérateur utilise category='numerique' (valeur déjà autorisée)
-- et chaque leçon garde son content_type existant (text/video/quiz/
-- checklist) ; le contenu structuré vit entièrement dans les tables
-- ci-dessous, jamais dans une valeur CHECK nouvelle.
--
-- academy_progress (member_id NOT NULL, scopé coopérative) n'est pas
-- réutilisée pour les candidats Opérateur : academy_profile_progress,
-- clé sur profiles.id, sert cet usage sans exiger de ligne members.
--
-- Écritures (progression, tentatives de quiz, soumissions) : aucune policy
-- INSERT/UPDATE côté client — uniquement lecture (own-row ou super_admin)
-- et lecture publique du contenu pédagogique. Les écritures passent par un
-- module serveur (service_role), pas par des policies own-row côté client.

CREATE TABLE academy_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES academy_lessons(id) ON DELETE CASCADE,
  asset_key text NOT NULL UNIQUE,
  asset_type text NOT NULL CHECK (asset_type IN ('screenshot', 'image', 'diagram', 'video')),
  source_route text,
  storage_path text,
  alt_text text,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_capture' CHECK (status IN ('pending_capture', 'ready', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_academy_assets_lesson ON academy_media_assets(lesson_id);

CREATE TABLE academy_lesson_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  slide_type text NOT NULL CHECK (slide_type IN ('objective', 'concept', 'screenshot', 'procedure', 'warning', 'case', 'summary')),
  order_index integer NOT NULL,
  media_asset_id uuid REFERENCES academy_media_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lesson_id, order_index)
);

CREATE INDEX idx_academy_slides_lesson ON academy_lesson_slides(lesson_id, order_index);

CREATE TABLE academy_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES academy_lessons(id) ON DELETE CASCADE UNIQUE,
  title text NOT NULL,
  description text,
  passing_score integer NOT NULL DEFAULT 70 CHECK (passing_score BETWEEN 0 AND 100),
  max_attempts integer,
  randomize_questions boolean NOT NULL DEFAULT true,
  show_feedback boolean NOT NULL DEFAULT true,
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy_quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES academy_quizzes(id) ON DELETE CASCADE,
  question_type text NOT NULL CHECK (question_type IN ('single_choice', 'multiple_choice', 'true_false', 'case')),
  prompt text NOT NULL,
  explanation text,
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  order_index integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (quiz_id, order_index)
);

CREATE INDEX idx_academy_questions_quiz ON academy_quiz_questions(quiz_id, order_index);

CREATE TABLE academy_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES academy_quiz_questions(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (question_id, order_index)
);

CREATE INDEX idx_academy_options_question ON academy_quiz_options(question_id, order_index);

CREATE TABLE academy_quiz_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id uuid NOT NULL REFERENCES academy_quizzes(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  passed boolean,
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_academy_attempts_profile ON academy_quiz_attempts(profile_id, created_at DESC);

CREATE TABLE academy_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL UNIQUE REFERENCES academy_lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  instructions text NOT NULL,
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  max_score integer NOT NULL DEFAULT 100 CHECK (max_score > 0),
  is_required boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy_assignment_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id uuid NOT NULL REFERENCES academy_assignments(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content_text text,
  attachment_url text,
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft', 'submitted', 'reviewed', 'revision_required')),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  feedback text,
  reviewed_by uuid REFERENCES profiles(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_academy_submissions_profile ON academy_assignment_submissions(profile_id, created_at DESC);

CREATE TABLE academy_profile_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES academy_lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  started_at timestamptz,
  completed_at timestamptz,
  last_viewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, module_id, lesson_id)
);

CREATE INDEX idx_academy_profile_progress_profile ON academy_profile_progress(profile_id, module_id);

-- ── RLS ──────────────────────────────────────────────────────────────────
-- Contenu pédagogique : lecture ouverte à tout compte authentifié (même
-- posture que academy_lessons existante). Données personnelles (tentatives,
-- soumissions, progression) : lecture own-row ou super_admin. Aucune écriture
-- client directe — passe par un module serveur avec le client service_role.

ALTER TABLE academy_media_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_lesson_slides ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quizzes ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_quiz_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_assignment_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_profile_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "academy v2 assets readable" ON academy_media_assets FOR SELECT TO authenticated USING (true);
CREATE POLICY "academy v2 slides readable" ON academy_lesson_slides FOR SELECT TO authenticated USING (true);
CREATE POLICY "academy v2 quizzes readable" ON academy_quizzes FOR SELECT TO authenticated USING (true);
CREATE POLICY "academy v2 questions readable" ON academy_quiz_questions FOR SELECT TO authenticated USING (true);
CREATE POLICY "academy v2 options readable" ON academy_quiz_options FOR SELECT TO authenticated USING (true);
CREATE POLICY "academy v2 assignments readable" ON academy_assignments FOR SELECT TO authenticated USING (true);

CREATE POLICY "academy quiz attempts own read" ON academy_quiz_attempts
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "academy assignment submissions own read" ON academy_assignment_submissions
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));

CREATE POLICY "academy profile progress own read" ON academy_profile_progress
  FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin'));
