
-- AgriAcademy V2 — parcours Opérateur certifié
-- Extension additive : slides, assets réels, quiz WQU-like, cas pratiques,
-- soumissions et progression par profiles.id pour les candidats sans coopérative.

CREATE TABLE academy_media_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES academy_lessons(id) ON DELETE CASCADE,
  asset_key text NOT NULL UNIQUE,
  asset_type text NOT NULL CHECK (asset_type IN ('screenshot','image','diagram','video')),
  source_route text,
  storage_path text,
  alt_text text,
  annotations jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'pending_capture' CHECK (status IN ('pending_capture','ready','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy_lesson_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_id uuid NOT NULL REFERENCES academy_lessons(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  slide_type text NOT NULL CHECK (slide_type IN ('objective','concept','screenshot','procedure','warning','case','summary')),
  order_index integer NOT NULL,
  media_asset_id uuid REFERENCES academy_media_assets(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lesson_id, order_index)
);

CREATE TABLE academy_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid UNIQUE REFERENCES academy_lessons(id) ON DELETE CASCADE,
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
  question_type text NOT NULL CHECK (question_type IN ('single_choice','multiple_choice','true_false','case')),
  prompt text NOT NULL,
  explanation text,
  points integer NOT NULL DEFAULT 1 CHECK (points > 0),
  order_index integer NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(quiz_id, order_index)
);

CREATE TABLE academy_quiz_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES academy_quiz_questions(id) ON DELETE CASCADE,
  label text NOT NULL,
  is_correct boolean NOT NULL DEFAULT false,
  order_index integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(question_id, order_index)
);

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
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('draft','submitted','reviewed','revision_required')),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  feedback text,
  reviewed_by uuid REFERENCES profiles(id),
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE academy_profile_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES academy_lessons(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','completed')),
  progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  score integer CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  started_at timestamptz,
  completed_at timestamptz,
  last_viewed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(profile_id, module_id, lesson_id)
);

CREATE INDEX idx_academy_slides_lesson ON academy_lesson_slides(lesson_id, order_index);
CREATE INDEX idx_academy_assets_lesson ON academy_media_assets(lesson_id);
CREATE INDEX idx_academy_questions_quiz ON academy_quiz_questions(quiz_id, order_index);
CREATE INDEX idx_academy_options_question ON academy_quiz_options(question_id, order_index);
CREATE INDEX idx_academy_attempts_profile ON academy_quiz_attempts(profile_id, created_at DESC);
CREATE INDEX idx_academy_submissions_profile ON academy_assignment_submissions(profile_id, created_at DESC);
CREATE INDEX idx_academy_profile_progress_profile ON academy_profile_progress(profile_id, module_id);

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

DO $$
DECLARE
  v_module_id uuid;
  v_lesson_id uuid;
  v_quiz_id uuid;
  v_question_id uuid;
  v_asset_id uuid;
BEGIN
  SELECT id INTO v_module_id
  FROM academy_modules
  WHERE title = 'Opérateur certifié FaîtiereHub — Pilote V1'
  ORDER BY created_at
  LIMIT 1;

  IF v_module_id IS NULL THEN
    RAISE EXCEPTION 'Module Opérateur certifié FaîtiereHub — Pilote V1 introuvable';
  END IF;

  UPDATE partner_certifications
  SET academy_module_id = v_module_id, updated_at = now()
  WHERE academy_module_id IS NULL;


  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '1. Comprendre FaîtiereHub et le rôle de l''Opérateur'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '1. Comprendre FaîtiereHub et le rôle de l''Opérateur';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-1-screen', 'screenshot', '/operator',
          'Capture exacte de l’interface FaîtiereHub pour 1. Comprendre FaîtiereHub et le rôle de l''Opérateur', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-1-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif de la leçon', 'Expliquer FaîtiereHub en moins de deux minutes et distinguer les espaces Organisation, Haroo et Opérateur.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Les trois capacités', 'Organisation = gestion des OP. Haroo = profils professionnels. Opérateur = prestataire local certifié. Un même compte peut cumuler les trois capacités.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Repérer l’espace Opérateur', 'Observer l’écran réel /operator : statut candidat, parcours de certification, wallet et actions disponibles. La capture exacte doit provenir du produit déployé.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Une personne est admin d’une coopérative, agronome Haroo et souhaite devenir Opérateur. Expliquez pourquoi elle ne doit pas créer trois comptes.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'L’Opérateur fournit des services aux organisations sans devenir propriétaire de leurs données et sans entrer dans leur hiérarchie.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 1. Comprendre FaîtiereHub et le rôle de l''Opérateur',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle affirmation décrit correctement l’Opérateur ?','L’Opérateur intervient par mandat et ne possède pas les données.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Il devient le propriétaire numérique de la coopérative',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Il reçoit un mandat de service limité',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Il remplace l’administrateur de l’organisation',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Il doit créer un nouveau compte',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un même compte peut cumuler une capacité organisationnelle, Haroo et Opérateur.','Le modèle de compte a été conçu pour cumuler ces capacités.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',true,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle activité est incompatible avec le modèle FaîtiereHub ?','Le réseau Opérateur ne doit pas devenir un système MLM.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Nettoyage de données',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Appui Kobo',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Commission pour recruter des opérateurs',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Reporting projet',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 1. Comprendre FaîtiereHub et le rôle de l''Opérateur','Présentez FaîtiereHub et le rôle d’un Opérateur en 8 à 12 lignes à un responsable de coopérative qui découvre la plateforme.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '2. Gouvernance des organisations et propriété des données'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '2. Gouvernance des organisations et propriété des données';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-2-screen', 'screenshot', '/dashboard',
          'Capture exacte de l’interface FaîtiereHub pour 2. Gouvernance des organisations et propriété des données', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-2-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Intervenir dans une organisation sans casser sa gouvernance ni confondre mandat de service et propriété.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Hiérarchie et mandat', 'Faîtière → Union → Coopérative → Membres. L’Opérateur reste transversal et agit uniquement dans les périmètres autorisés.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Lire le contexte organisationnel', 'Observer l’écran réel du dashboard et le sélecteur d’organisation pour comprendre sur quelle structure une action va s’appliquer.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Une union demande l’export de tous les téléphones de ses membres pour un partenaire commercial. Décrivez les vérifications à faire avant l’export.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Les données appartiennent à l’organisation. Un mandat peut être révoqué sans supprimer les membres, cartes ou historiques.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 2. Gouvernance des organisations et propriété des données',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Qui est propriétaire des données d’une coopérative ?','Le partenaire n’a qu’un accès délégué.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'L’Opérateur',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'FaîtiereHub',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'La coopérative / organisation concernée',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'L’imprimeur de cartes',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Que doit provoquer le changement d’Opérateur ?','Les données restent rattachées à l’organisation.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Suppression des membres',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Réinitialisation des cartes',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Perte des historiques',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Aucune perte de données',true,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un mandat Opérateur donne automatiquement tous les droits dans une organisation.','Les droits doivent être limités à des scopes explicites.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 2. Gouvernance des organisations et propriété des données','Rédigez un exemple de mandat limité pour un Opérateur chargé uniquement de l’import des membres et de la génération de rapports.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '3. Diagnostic initial et onboarding d''une organisation'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '3. Diagnostic initial et onboarding d''une organisation';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-3-screen', 'screenshot', '/admin/cooperatives',
          'Capture exacte de l’interface FaîtiereHub pour 3. Diagnostic initial et onboarding d''une organisation', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-3-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Transformer une première rencontre avec une organisation en diagnostic structuré et plan d’onboarding.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Le diagnostic avant la configuration', 'Identifier niveau de structure, responsables, zones, sources de données, besoins prioritaires, volumes et qualité des fichiers.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Repérer les informations d’une organisation', 'Observer l’écran réel de gestion des organisations : nom, niveau, rattachement et contexte avant de modifier des données.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Une coopérative arrive avec trois fichiers Excel contradictoires et un cahier papier. Proposez l’ordre de traitement.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Livrable minimum', 'Organisation correctement identifiée, administrateur désigné, données prioritaires nettoyées, lot test validé et plan de travail court.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 3. Diagnostic initial et onboarding d''une organisation',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle est la première action d’un onboarding fiable ?','Le diagnostic précède toute migration.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Importer toutes les données',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Comprendre la structure et les sources existantes',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Imprimer les cartes',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Créer un rapport final',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Il est préférable d’importer l’ensemble du fichier avant de tester un petit lot.','Un lot test réduit fortement le risque.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Lequel est un bon livrable d’onboarding ?','L’onboarding doit produire une base et un plan validés.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Une base non vérifiée',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Un plan de travail validé',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Des mots de passe partagés',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Une carte imprimée pour chaque membre avant contrôle',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 3. Diagnostic initial et onboarding d''une organisation','Construisez une checklist d’onboarding en 10 points pour une coopérative de 250 membres.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '4. Gestion des membres et qualité des données'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '4. Gestion des membres et qualité des données';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-4-screen', 'screenshot', '/dashboard/members',
          'Capture exacte de l’interface FaîtiereHub pour 4. Gestion des membres et qualité des données', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-4-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Créer, importer et corriger des membres sans introduire de doublons ni d’incohérences.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Chaîne qualité', 'Collecte → Vérification → lot test → contrôle → correction → import final → validation organisation.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Page Membres', 'Utiliser une capture exacte de /dashboard/members pour identifier recherche, filtres, création, import et actions sur un membre.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Vous recevez un fichier de 120 membres avec doublons, téléphones incomplets et localités incohérentes. Décrivez votre protocole.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Une bonne base membre conditionne la fiabilité des cartes, rapports, cotisations et projets.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 4. Gestion des membres et qualité des données',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Avant un import massif, que faut-il faire ?','Le lot test permet de vérifier la correspondance des données.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Imprimer les cartes',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Tester un petit lot après contrôle des colonnes',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Supprimer les anciens membres',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Créer un projet',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'multiple_choice','Quels éléments peuvent aider à repérer un doublon ?','Plusieurs indices doivent être croisés.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Nom et prénom',true,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Téléphone',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Localité',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Identifiant interne',true,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un nom correct suffit à considérer un enregistrement comme fiable.','La qualité dépend de plusieurs champs et contrôles.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 4. Gestion des membres et qualité des données','Décrivez un protocole de nettoyage et d’import pour 120 membres en distinguant contrôle avant, pendant et après import.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '5. Cartes numériques, QR et cartes physiques'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '5. Cartes numériques, QR et cartes physiques';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-5-screen', 'screenshot', '/dashboard/cards',
          'Capture exacte de l’interface FaîtiereHub pour 5. Cartes numériques, QR et cartes physiques', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-5-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Distinguer identité numérique, QR de vérification et service de carte physique.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Deux couches différentes', 'La carte numérique identifie le membre. Le PVC est un support matériel optionnel avec impression, logistique et livraison.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Page Cartes', 'Utiliser la capture exacte de /dashboard/cards puis de /verify/[card_number] pour montrer génération, statut, aperçu et vérification publique.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Une coopérative affirme qu’un membre n’existe pas tant que son PVC n’est pas imprimé. Expliquez la distinction.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Modèle pilote', 'Carte physique prévue à 2 000 FCFA : 500 FCFA pour l’organisation, 1 500 FCFA dans le flux commercial de l’Opérateur.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 5. Cartes numériques, QR et cartes physiques',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle affirmation est correcte ?','Le QR et l’identité numérique ne doivent pas dépendre du PVC.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'La carte PVC crée l’identité numérique',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Le QR dépend de l’impression',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Identité numérique et support physique sont distincts',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Sans PVC le membre est supprimé',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quel est le prix pilote prévu de la carte physique ?','Le prix pilote défini est de 2 000 FCFA.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'500 FCFA',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'1 000 FCFA',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'1 500 FCFA',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'2 000 FCFA',true,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle part est prévue pour l’organisation ?','500 FCFA reviennent à l’organisation.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'250 FCFA',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'500 FCFA',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'750 FCFA',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'1 000 FCFA',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 5. Cartes numériques, QR et cartes physiques','Rédigez une explication client courte sur la différence entre carte numérique, QR et carte physique.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '6. KoboToolbox, collecte terrain et importation'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '6. KoboToolbox, collecte terrain et importation';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-6-screen', 'screenshot', '/dashboard/kobo-setup',
          'Capture exacte de l’interface FaîtiereHub pour 6. KoboToolbox, collecte terrain et importation', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-6-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Préparer une collecte terrain utile, testée et importable dans FaîtiereHub.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Commencer par la décision', 'Chaque question doit servir une décision, un indicateur ou une opération. Éviter les variables inutiles.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Intégration Kobo', 'Utiliser la capture exacte de /dashboard/kobo-setup pour présenter configuration, connexion et flux d’import.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Vous devez collecter 300 producteurs en zone à faible connexion. Décrivez le test pilote, le mode hors ligne et les contrôles.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Sauvegarder la source, tester le formulaire, importer un petit lot puis contrôler avant le lot complet.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 6. KoboToolbox, collecte terrain et importation',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle est la meilleure origine d’un formulaire Kobo ?','Le besoin décisionnel guide les variables.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Une longue liste de questions',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'La décision ou l’indicateur à produire',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Le design du formulaire',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Le nombre d’enquêteurs',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un formulaire doit être testé avant un déploiement massif.','Le pilote permet d’identifier les erreurs tôt.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',true,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Avant import complet, il faut :','Le contrôle avant import protège la base.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Supprimer le fichier source',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Tester un lot et vérifier la correspondance des colonnes',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Désactiver les contraintes',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Ignorer les doublons',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 6. KoboToolbox, collecte terrain et importation','Concevez le plan d’un mini formulaire Kobo de 12 champs pour enregistrer des producteurs d’une coopérative.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '7. Suivi de projets, MEAL et rapports'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '7. Suivi de projets, MEAL et rapports';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-7-screen', 'screenshot', '/dashboard/analytics',
          'Capture exacte de l’interface FaîtiereHub pour 7. Suivi de projets, MEAL et rapports', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-7-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Transformer les données en indicateurs vérifiables utiles à la décision et au reporting.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Indicateur complet', 'Définition + unité + période + source + responsable + cible éventuelle.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Statistiques et rapports', 'Utiliser une capture exacte de /dashboard/analytics pour montrer les indicateurs disponibles et la lecture des écarts.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Un projet annonce 1 200 bénéficiaires, mais 1 126 sont validés en base. Préparez la formulation correcte du rapport.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Ne jamais transformer une cible, une estimation ou une donnée manquante en résultat observé.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 7. Suivi de projets, MEAL et rapports',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Une cible de 1 200 et 1 126 personnes validées doivent être présentées comme :','La traçabilité exige de distinguer cible et réalisé.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Le même chiffre',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Cible et valeur observée distinctes',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Une moyenne',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Une erreur à cacher',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'multiple_choice','Quels éléments définissent correctement un indicateur ?','Un indicateur exploitable doit être documenté.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Unité',true,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Période',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Source',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Responsable',true,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','On peut compléter une désagrégation manquante par estimation sans le préciser.','Les données manquantes ne doivent jamais être inventées.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 7. Suivi de projets, MEAL et rapports','Construisez cinq indicateurs de suivi pour un projet de digitalisation de 8 coopératives.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '8. Modèle économique de l''Opérateur et PAYG'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '8. Modèle économique de l''Opérateur et PAYG';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-8-screen', 'screenshot', '/operator',
          'Capture exacte de l’interface FaîtiereHub pour 8. Modèle économique de l''Opérateur et PAYG', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-8-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Comprendre comment l’Opérateur gagne sa vie tout en gardant le Core gratuit pour les organisations.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Operator-funded SaaS', 'L’Opérateur vend des services réels et paie son usage professionnel de FaîtiereHub via PAYG ou, plus tard, un plan.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Wallet Opérateur', 'Utiliser une capture exacte de /operator montrant solde, rechargement et historique PAYG.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Vous gérez 8 organisations et votre wallet devient insuffisant. Distinguez ce qui peut être bloqué de ce qui doit rester accessible.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Un manque de crédit bloque uniquement la nouvelle opération payante. Les données, cartes existantes et comptes des organisations restent intacts.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 8. Modèle économique de l''Opérateur et PAYG',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Qui paie principalement FaîtiereHub dans ce modèle ?','Le modèle cible déplace la monétisation vers l’Opérateur.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Tous les membres',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'L’organisation via abonnement obligatoire',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'L’Opérateur via son usage professionnel',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'L’imprimeur uniquement',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un wallet insuffisant doit désactiver les cartes déjà existantes.','Seule la nouvelle opération payante doit être bloquée.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quel revenu est interdit dans ce modèle ?','Le modèle exclut les logiques MLM.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Nettoyage de données',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Collecte Kobo',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Commission de recrutement d’autres opérateurs',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Rapport projet',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 8. Modèle économique de l''Opérateur et PAYG','Construisez une mini-offre commerciale pour trois coopératives en séparant services, coûts terrain et usage FaîtiereHub.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '9. Sécurité, confidentialité et gestion des incidents'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '9. Sécurité, confidentialité et gestion des incidents';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-9-screen', 'screenshot', '/operator',
          'Capture exacte de l’interface FaîtiereHub pour 9. Sécurité, confidentialité et gestion des incidents', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-9-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Protéger les comptes, données et opérations financières lors des missions.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Moindre privilège', 'Utiliser son propre compte, ne jamais partager de mot de passe et n’exporter que les données nécessaires.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Repérer son contexte de travail', 'Utiliser une capture exacte de l’espace connecté pour montrer identité, organisation/partenaire actif et navigation avant une opération sensible.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Un téléphone contenant un export de membres est perdu. Décrivez les actions immédiates et la documentation de l’incident.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'Arrêter, conserver les références, signaler, expliquer l’impact réel, corriger et documenter.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 9. Sécurité, confidentialité et gestion des incidents',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Un Opérateur peut utiliser le compte d’un administrateur si celui-ci donne son mot de passe.','Chaque personne doit utiliser son propre compte.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Après un incident, quelle première attitude est correcte ?','La maîtrise de l’incident commence par limiter l’impact.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Masquer l’erreur',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Continuer comme si de rien n’était',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Arrêter l’opération concernée et préserver les références',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Supprimer l’historique',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quel export est acceptable ?','La minimisation réduit le risque.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Tout exporter par habitude',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Seulement les données nécessaires et autorisées',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Exporter vers un compte personnel sans contrôle',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Partager la base complète par messagerie',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 9. Sécurité, confidentialité et gestion des incidents','Rédigez une fiche d’incident pour un import effectué par erreur dans la mauvaise organisation.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '10. Service client terrain et professionnalisme'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '10. Service client terrain et professionnalisme';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-10-screen', 'screenshot', '/operator',
          'Capture exacte de l’interface FaîtiereHub pour 10. Service client terrain et professionnalisme', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-10-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Vendre et livrer un résultat professionnel plutôt qu’un simple accès logiciel.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Parler résultat', 'Le client recherche une base propre, des cartes, un rapport, une collecte ou un suivi de projet—notre outil sert ces résultats.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Suivre son activité', 'Utiliser l’espace Opérateur réel pour montrer les organisations suivies, actions en attente et statut de certification lorsque le dashboard complet sera disponible.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Cas pratique', 'Un client demande une fonction encore en développement. Formulez une réponse professionnelle distinguant disponible, pilote et prévu.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'À retenir', 'À la fin d’une mission, laisser un bilan : actions réalisées, volumes traités, anomalies, prochaine étape et responsable.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 10. Service client terrain et professionnalisme',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quelle formulation commerciale est la plus pertinente ?','Le client achète un résultat métier.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Je vends un SaaS',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Je vous aide à obtenir une base propre et un suivi exploitable',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Je vous oblige à prendre un abonnement',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Je possède vos données',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','Il est acceptable de présenter comme disponible une fonction seulement prévue.','La confiance exige de distinguer réel, pilote et futur.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','En fin de mission, il faut notamment documenter :','La traçabilité fait partie du service.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Seulement le prix',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Ce qui a été fait et les anomalies restantes',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Les mots de passe',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Les données d’autres clients',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 10. Service client terrain et professionnalisme','Préparez un compte rendu de fin de mission d’une page pour une opération d’import et de nettoyage de 300 membres.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '11. Mise en situation pratique — préparation à la certification'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '11. Mise en situation pratique — préparation à la certification';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-11-screen', 'screenshot', '/dashboard/members',
          'Capture exacte de l’interface FaîtiereHub pour 11. Mise en situation pratique — préparation à la certification', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-11-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Mobiliser l’ensemble des compétences dans un scénario proche d’une mission réelle.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Scénario', 'Coopérative fictive de 120 membres, fichier imparfait, préparation d’une intervention financée, besoin de cartes et de reporting.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Parcours multi-écrans', 'Utiliser des captures exactes Membres, Cartes, Kobo et Analytics pour que le candidat explique les étapes du workflow.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Mission pratique', 'Diagnostiquer les données, proposer l’import, définir un mini-formulaire Kobo, cinq indicateurs et expliquer le modèle de carte et de gouvernance.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Critères', 'Précision, gouvernance, maîtrise du produit, qualité des données, sécurité, compréhension économique et capacité d’explication.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 11. Mise en situation pratique — préparation à la certification',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Dans une mission complète, quelle action vient avant l’import massif ?','Le diagnostic et le lot test réduisent le risque.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Impression',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Diagnostic et lot test',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Paiement certification',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Suppression des anciens membres',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'multiple_choice','Quels domaines doivent être maîtrisés dans cette mise en situation ?','La mission finale combine plusieurs compétences.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Données membres',true,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Kobo',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Cartes',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Reporting',true,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','La réussite de la checklist pratique suffit à elle seule pour attribuer la certification.','La validation officielle reste distincte.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 11. Mise en situation pratique — préparation à la certification','Produisez votre réponse complète au scénario de la coopérative de 120 membres : diagnostic, workflow, contrôles, indicateurs et offre de service.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

  SELECT id INTO v_lesson_id FROM academy_lessons
  WHERE module_id = v_module_id AND title = '12. Auto-évaluation avant l''examen pratique'
  LIMIT 1;
  IF v_lesson_id IS NULL THEN
    RAISE EXCEPTION 'Leçon introuvable: %', '12. Auto-évaluation avant l''examen pratique';
  END IF;

  INSERT INTO academy_media_assets(module_id, lesson_id, asset_key, asset_type, source_route, alt_text, status)
  VALUES (v_module_id, v_lesson_id, 'operator-v2-lesson-12-screen', 'screenshot', '/operator',
          'Capture exacte de l’interface FaîtiereHub pour 12. Auto-évaluation avant l''examen pratique', 'pending_capture')
  ON CONFLICT (asset_key) DO UPDATE
    SET lesson_id = EXCLUDED.lesson_id, source_route = EXCLUDED.source_route, alt_text = EXCLUDED.alt_text;

  SELECT id INTO v_asset_id FROM academy_media_assets WHERE asset_key = 'operator-v2-lesson-12-screen';


  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Objectif', 'Vérifier sa préparation avant l’évaluation pratique officielle.', 'objective', 1, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Auto-évaluation formative', 'Le score aide à identifier les points à revoir mais ne remplace pas l’évaluation officielle validée par un administrateur/examinateur.', 'concept', 2, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Parcours de certification', 'Utiliser une capture exacte de /operator pour montrer les étapes formation → évaluation → paiement → certification/activation.', 'screenshot', 3, v_asset_id)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Décision de préparation', 'Si votre score est inférieur au seuil, identifiez les leçons faibles et préparez un plan de révision.', 'case', 4, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_lesson_slides(lesson_id,title,body,slide_type,order_index,media_asset_id)
  VALUES (v_lesson_id, 'Seuil conseillé', 'Viser au moins 70 % sur les quiz et une maîtrise opérationnelle réelle avant l’évaluation pratique.', 'summary', 5, NULL)
  ON CONFLICT (lesson_id,order_index) DO UPDATE
    SET title=EXCLUDED.title, body=EXCLUDED.body, slide_type=EXCLUDED.slide_type, media_asset_id=EXCLUDED.media_asset_id;

  INSERT INTO academy_quizzes(module_id,lesson_id,title,description,passing_score,max_attempts,randomize_questions,show_feedback,is_required)
  VALUES (v_module_id,v_lesson_id,'Quiz — 12. Auto-évaluation avant l''examen pratique',
          'Knowledge Check inspiré du format WQU : questions courtes, feedback immédiat et seuil de validation.',
          70,NULL,true,true,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title, description=EXCLUDED.description, passing_score=70, show_feedback=true, is_required=true;

  SELECT id INTO v_quiz_id FROM academy_quizzes WHERE lesson_id=v_lesson_id;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Quel est le seuil de réussite configuré pour l’examen partenaire ?','Le seuil actuel est configurable et seedé à 70 %.',1,1)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=1;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'50 %',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'60 %',false,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'70 %',true,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'100 %',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'single_choice','Avant de payer la certification, il faut :','Le paiement de certification est gardé par ces deux validations.',1,2)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=2;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Seulement créer un compte',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Formation validée et examen pratique réussi',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Imprimer une carte',false,3)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Recruter un autre opérateur',false,4)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_questions(quiz_id,question_type,prompt,explanation,points,order_index)
  VALUES (v_quiz_id,'true_false','L’auto-évaluation attribue automatiquement la certification.','La certification reste une transition contrôlée.',1,3)
  ON CONFLICT (quiz_id,order_index) DO UPDATE
    SET question_type=EXCLUDED.question_type,prompt=EXCLUDED.prompt,explanation=EXCLUDED.explanation;

  SELECT id INTO v_question_id FROM academy_quiz_questions WHERE quiz_id=v_quiz_id AND order_index=3;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Vrai',false,1)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_quiz_options(question_id,label,is_correct,order_index)
  VALUES (v_question_id,'Faux',true,2)
  ON CONFLICT (question_id,order_index) DO UPDATE
    SET label=EXCLUDED.label,is_correct=EXCLUDED.is_correct;

  INSERT INTO academy_assignments(lesson_id,title,instructions,rubric,max_score,is_required)
  VALUES (v_lesson_id,'Cas pratique — 12. Auto-évaluation avant l''examen pratique','Rédigez votre plan personnel de préparation à l’examen : trois points forts, trois points à réviser et deux cas pratiques à refaire.','{"criteria":[{"name":"Exactitude métier","weight":30},{"name":"Respect gouvernance et données","weight":25},{"name":"Maîtrise de la plateforme","weight":25},{"name":"Clarté professionnelle","weight":20}]}',100,true)
  ON CONFLICT (lesson_id) DO UPDATE
    SET title=EXCLUDED.title,instructions=EXCLUDED.instructions,rubric=EXCLUDED.rubric,max_score=100,is_required=true;

END $$;
