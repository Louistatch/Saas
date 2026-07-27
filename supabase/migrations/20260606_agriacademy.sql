CREATE TABLE IF NOT EXISTS academy_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cooperative_id UUID REFERENCES cooperatives(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('agronomie','phytosanitaire','gestion','commerce','numerique','autre')),
  culture TEXT,
  level TEXT NOT NULL DEFAULT 'debutant' CHECK (level IN ('debutant','intermediaire','avance')),
  duration_min INTEGER,
  thumbnail_url TEXT,
  is_published BOOLEAN DEFAULT false,
  order_index INTEGER DEFAULT 0,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content_type TEXT NOT NULL CHECK (content_type IN ('text','video','quiz','checklist')),
  content_body TEXT,
  order_index INTEGER DEFAULT 0,
  duration_min INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS academy_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  module_id UUID NOT NULL REFERENCES academy_modules(id) ON DELETE CASCADE,
  lesson_id UUID REFERENCES academy_lessons(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'started' CHECK (status IN ('started','completed')),
  score INTEGER,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(member_id, module_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_academy_modules_coop ON academy_modules(cooperative_id, is_published);
CREATE INDEX IF NOT EXISTS idx_academy_lessons_module ON academy_lessons(module_id, order_index);
CREATE INDEX IF NOT EXISTS idx_academy_progress_member ON academy_progress(member_id, module_id);

ALTER TABLE academy_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_lessons ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modules published readable" ON academy_modules
  FOR SELECT TO authenticated USING (is_published = true OR cooperative_id IN (
    SELECT cooperative_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "modules admin write" ON academy_modules
  FOR ALL USING (cooperative_id IN (
    SELECT cooperative_id FROM profiles WHERE id = auth.uid()
  ));
CREATE POLICY "lessons readable" ON academy_lessons
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "progress own" ON academy_progress
  FOR ALL USING (
    member_id IN (SELECT id FROM members WHERE cooperative_id IN (
      SELECT cooperative_id FROM profiles WHERE id = auth.uid()
    ))
  );

INSERT INTO academy_modules (title, description, category, level, duration_min, is_published, order_index) VALUES
  ('Introduction au Cacao', 'Bases de la culture du cacao en Afrique de l''Ouest', 'agronomie', 'debutant', 45, true, 1),
  ('Gestion des Ravageurs', 'Identifier et traiter les principales maladies du cacao', 'phytosanitaire', 'intermediaire', 60, true, 2),
  ('Tenue du Carnet Agricole', 'Comment enregistrer ses activités agricoles', 'gestion', 'debutant', 30, true, 3),
  ('Vendre sa Récolte au Meilleur Prix', 'Stratégies de commercialisation et AgriMarket', 'commerce', 'intermediaire', 45, true, 4),
  ('Utiliser FaîtiereHub sur Mobile', 'Guide pratique de l''application', 'numerique', 'debutant', 20, true, 5),
  ('Fertilisation Raisonnée', 'Optimiser les intrants pour maximiser le rendement', 'agronomie', 'avance', 90, true, 6)
ON CONFLICT DO NOTHING;
