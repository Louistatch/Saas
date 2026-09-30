-- Protège les sept tables du pipeline d'ingestion CPC d'AgriTogo.
--
-- Elles sont créées par les migrations 20260930_* du dépôt Louistatch/agritogo,
-- appliquées à CETTE base partagée. Aucune n'activait RLS. Sur Supabase, une
-- table du schéma public sans RLS est exposée par PostgREST avec les droits par
-- défaut : `anon` disposait de SELECT, INSERT, UPDATE, DELETE et TRUNCATE
-- (vérifié via information_schema.role_table_grants).
--
-- La clé anon est publique — elle part dans le bundle navigateur. N'importe qui
-- pouvait donc vider market_price_staging, ou y injecter de faux relevés que le
-- pipeline aurait promus dans market_prices et affichés aux producteurs comme
-- des prix de marché. C'est un vecteur de manipulation des prix, pas seulement
-- une fuite de lecture.
--
-- RLS activé SANS politique : anon et authenticated sont bloqués, tandis que
-- service_role — utilisé par le pipeline (SUPABASE_SERVICE_KEY) — contourne RLS
-- et continue de fonctionner. FaîtiereHub ne lit aucune de ces tables : il ne
-- lit que market_prices, dont les 9 politiques sont inchangées.
--
-- Pour exposer plus tard une de ces tables en lecture (un tableau de bord de
-- qualité des sources, par exemple), ajouter une politique SELECT explicite
-- plutôt que de désactiver RLS.
--
-- Appliqué en production sous le nom `market_ingestion_tables_rls`.
-- Ce fichier vit côté Saas parce que c'est ce dépôt qui porte l'historique des
-- migrations de la base partagée.

alter table if exists public.market_ingestion_runs   enable row level security;
alter table if exists public.market_raw_payloads     enable row level security;
alter table if exists public.market_price_staging    enable row level security;
alter table if exists public.market_entity_aliases   enable row level security;
alter table if exists public.market_source_endpoints enable row level security;
alter table if exists public.market_data_sources     enable row level security;
alter table if exists public.market_price_forecasts  enable row level security;

-- Les prévisions sont destinées à être montrées aux membres : lecture seule
-- pour les comptes authentifiés, écriture réservée au pipeline.
drop policy if exists "forecasts readable by authenticated" on public.market_price_forecasts;
create policy "forecasts readable by authenticated"
    on public.market_price_forecasts for select to authenticated using (true);
