-- Kobo — rapprochement hiérarchique, un formulaire = une organisation, bucket des signatures.
--
-- MIGRATION ADDITIVE, NON APPLIQUÉE : à relire puis appliquer par l'équipe, APRÈS
-- 20261010_100000_kobo_security_and_sync.sql (ordre alphabétique des fichiers).
--
-- Le code de l'application fonctionne AVANT comme APRÈS cette migration :
--   * le rapprochement des membres (carte, téléphone) est fait côté serveur dans l'arbre de
--     l'organisation (get_cooperative_descendants, déjà en production) ; la fonction SQL
--     ci-dessous n'est plus appelée par l'application, elle est corrigée pour ne pas rester
--     un piège pour un autre appelant ;
--   * le verrou par soumission utilise le statut 'processing' (UPDATE conditionnel atomique,
--     sans fonction ni colonne nouvelle) ; le statut est déjà dans le CHECK de la migration
--     20261010_100000 ;
--   * la déduplication des soumissions utilise kobo_instance_id = meta/rootUuid (repli _uuid) ;
--     aucune colonne n'est ajoutée : une soumission jamais modifiée a rootUuid = _uuid, donc les
--     lignes déjà en base restent retrouvables.
--   * le contrôle « formulaire déjà lié à une autre organisation » est fait par l'API
--     (409) ; l'index unique ci-dessous le garantit en base (la course entre deux
--     enregistrements simultanés est alors rejetée par PostgreSQL).

-- ── kobo-29 · un formulaire Kobo ne peut alimenter qu'UNE organisation ────────────────
-- Index unique partiel sur le Form ID des intégrations actives. S'il existe déjà un doublon,
-- l'index n'est PAS créé (simple NOTICE) : corriger les doublons (déconnecter l'une des deux
-- intégrations), puis rejouer ce bloc. Vérification préalable :
--   SELECT config->>'form_id' AS form_id, array_agg(cooperative_id)
--   FROM public.integrations
--   WHERE type = 'kobo' AND status <> 'disconnected' AND COALESCE(config->>'form_id', '') <> ''
--   GROUP BY 1 HAVING count(*) > 1;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.integrations
    WHERE type = 'kobo' AND status <> 'disconnected' AND COALESCE(config->>'form_id', '') <> ''
    GROUP BY config->>'form_id'
    HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'uq_integrations_kobo_form NON créé : un même formulaire est lié à plusieurs intégrations actives. Corriger puis rejouer ce bloc.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uq_integrations_kobo_form
      ON public.integrations ((config->>'form_id'))
      WHERE type = 'kobo' AND status <> 'disconnected' AND COALESCE(config->>'form_id', '') <> '';
  END IF;
END
$$;

-- ── kobo-09 · match_kobo_submission_to_member : arbre de l'organisation ───────────────
-- Avant : `mc.cooperative_id = v_cooperative_id` (égalité stricte). Or l'intégration est liée à
-- la faîtière/union et les membres sont dans les coopératives filles : aucune carte n'était
-- retrouvée. Maintenant : cartes FAITIERE actives de toute la descendance, numéro normalisé
-- (trim + majuscules) ; plusieurs membres pour un même numéro = ambigu (« unmatched »).
-- La garde d'accès (service_role ou admin de la coopérative) est conservée à l'identique.
CREATE OR REPLACE FUNCTION public.match_kobo_submission_to_member(p_submission_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_card_number text;
  v_cooperative_id uuid;
  v_member_id uuid;
  v_matches integer;
BEGIN
  SELECT upper(btrim(member_card_number)), cooperative_id
    INTO v_card_number, v_cooperative_id
    FROM kobo_submissions WHERE id = p_submission_id;

  IF NOT (public.is_service_role() OR public.is_coop_admin_or_super(v_cooperative_id)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF v_card_number IS NULL OR v_card_number = '' THEN
    UPDATE kobo_submissions SET status = 'unmatched', updated_at = now() WHERE id = p_submission_id;
    RETURN;
  END IF;

  SELECT count(DISTINCT mc.member_id), min(mc.member_id::text)::uuid
    INTO v_matches, v_member_id
    FROM member_cards mc
    JOIN members m ON m.id = mc.member_id
   WHERE mc.card_number = v_card_number
     AND mc.card_type = 'FAITIERE'
     AND mc.status = 'active'
     AND mc.cooperative_id IN (SELECT d.id FROM public.get_cooperative_descendants(v_cooperative_id) d);

  IF v_matches = 1 THEN
    UPDATE kobo_submissions
       SET member_id = v_member_id, status = 'matched', matched_at = now(), updated_at = now()
     WHERE id = p_submission_id;
  ELSE
    UPDATE kobo_submissions SET status = 'unmatched', updated_at = now() WHERE id = p_submission_id;
  END IF;
END;
$function$;

-- ── kobo-28 · bucket member-signatures versionné ──────────────────────────────────────
-- Le bucket existe en production (créé à la main le 2026-06-04, public) mais dans aucune
-- migration : un environnement recréé depuis le dépôt n'aurait aucune signature. Sans effet
-- là où il existe déjà. L'application écrit dans ce bucket avec le service_role (inscription
-- Kobo et rattrapage, chemin <cooperative_id>/kobo/<member_id>/…), donc aucune policy
-- d'écriture n'est nécessaire pour ce flux. ATTENTION : le bucket est public (les URL de
-- signatures sont lisibles par quiconque les connaît) — le passage en privé + URL signées est
-- une décision produit, non prise ici.
INSERT INTO storage.buckets (id, name, public)
VALUES ('member-signatures', 'member-signatures', true)
ON CONFLICT (id) DO NOTHING;
