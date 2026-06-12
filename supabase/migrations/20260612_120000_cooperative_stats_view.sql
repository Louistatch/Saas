-- ─────────────────────────────────────────────────────────────────────────────
-- Vue cooperative_stats — statistiques par coopérative pour le panneau admin
--
-- Référencée par app/admin/page.tsx depuis l'origine mais jamais créée en
-- base (la liste « Coopératives récentes » restait vide). En plus des
-- compteurs directs, expose les compteurs HIÉRARCHIQUES (la coopérative et
-- toutes ses descendantes : faîtière → unions → coopératives), pour que les
-- faîtières/unions reflètent l'activité réelle de leur réseau.
--
-- security_invoker : la vue s'exécute avec les droits (et la RLS) de
-- l'appelant — pas de contournement des policies.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE VIEW cooperative_stats
WITH (security_invoker = true) AS
WITH RECURSIVE tree AS (
  SELECT id AS root_id, id AS coop_id FROM cooperatives
  UNION ALL
  SELECT t.root_id, c.id FROM cooperatives c JOIN tree t ON c.parent_id = t.coop_id
)
SELECT
  c.id,
  c.name,
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
