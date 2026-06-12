-- ─────────────────────────────────────────────────────────────────────────────
-- Vue cooperative_stats v2 — ajoute description et primary_color
--
-- La page /admin/cooperatives sélectionne aussi description et primary_color
-- depuis la vue ; la v1 ne les exposait pas et la page retombait sur son
-- fallback N+1. Recrée la vue avec le jeu de colonnes complet.
-- ─────────────────────────────────────────────────────────────────────────────

DROP VIEW IF EXISTS cooperative_stats;
CREATE VIEW cooperative_stats
WITH (security_invoker = true) AS
WITH RECURSIVE tree AS (
  SELECT id AS root_id, id AS coop_id FROM cooperatives
  UNION ALL
  SELECT t.root_id, c.id FROM cooperatives c JOIN tree t ON c.parent_id = t.coop_id
)
SELECT
  c.id,
  c.name,
  c.description,
  c.primary_color,
  c.level,
  c.parent_id,
  c.created_at,
  (SELECT count(*) FROM members m WHERE m.cooperative_id = c.id) AS member_count,
  (SELECT count(*) FROM fiches_techniques f WHERE f.cooperative_id = c.id) AS exploitation_count,
  (SELECT count(*) FROM member_cards k
     WHERE k.cooperative_id = c.id AND k.status = 'active') AS active_card_count,
  (SELECT count(*) FROM members m
     WHERE m.cooperative_id IN (SELECT coop_id FROM tree WHERE root_id = c.id)) AS hierarchy_member_count,
  (SELECT count(*) FROM member_cards k
     WHERE k.status = 'active'
       AND k.cooperative_id IN (SELECT coop_id FROM tree WHERE root_id = c.id)) AS hierarchy_card_count
FROM cooperatives c;
