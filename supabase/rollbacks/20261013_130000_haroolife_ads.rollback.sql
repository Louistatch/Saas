-- Retour arrière de 20261013_130000_haroolife_ads.sql (campagnes et statistiques des panneaux).
-- Supprime uniquement ce que la migration a créé. Exporter les statistiques avant si besoin.
DROP FUNCTION IF EXISTS public.haroolife_ad_admin_rollback(uuid, integer);
DROP FUNCTION IF EXISTS public.haroolife_ad_admin_move(uuid, text);
DROP FUNCTION IF EXISTS public.haroolife_ad_admin_save(jsonb);
DROP FUNCTION IF EXISTS public.haroolife_ad_admin_list();
DROP FUNCTION IF EXISTS public.haroolife_ad_record(jsonb);
DROP FUNCTION IF EXISTS public.haroolife_ads_live(text);
DROP FUNCTION IF EXISTS private.haroolife_ad_snapshot(public.haroolife_ad_campaigns, uuid);
DROP FUNCTION IF EXISTS private.haroolife_ad_json(public.haroolife_ad_campaigns);
DROP FUNCTION IF EXISTS private.haroolife_ad_is_admin();
DROP TABLE IF EXISTS public.haroolife_ad_stats;
DROP TABLE IF EXISTS public.haroolife_ad_campaign_versions;
DROP TABLE IF EXISTS public.haroolife_ad_campaigns;
