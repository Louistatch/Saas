-- Retour arrière de 20261014_090000_anon_contact_columns.sql : rend au rôle anon la lecture de
-- toutes les colonnes de cooperatives et techniciens (état antérieur).
GRANT SELECT ON public.cooperatives TO anon;
GRANT SELECT ON public.techniciens TO anon;
