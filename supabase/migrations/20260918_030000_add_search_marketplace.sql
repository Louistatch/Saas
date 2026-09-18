-- Fonction de recherche filtrée pour la marketplace.
-- Appelée par hooks/use-marketplace-data.ts via supabase.rpc('search_marketplace', {...}).
-- Retourne jsonb {products, total, page, page_size, total_pages}.
CREATE OR REPLACE FUNCTION search_marketplace(
  search_query         text    DEFAULT NULL,
  filter_category      text    DEFAULT NULL,
  filter_culture       text    DEFAULT NULL,
  filter_region_id     uuid    DEFAULT NULL,
  filter_prefecture_id uuid    DEFAULT NULL,
  filter_canton_id     uuid    DEFAULT NULL,
  filter_cooperative_id uuid   DEFAULT NULL,
  filter_available     boolean DEFAULT true,
  filter_min_price     numeric DEFAULT NULL,
  filter_max_price     numeric DEFAULT NULL,
  filter_certification text    DEFAULT NULL,
  filter_season        text    DEFAULT NULL,
  filter_producer_type text    DEFAULT NULL,
  sort_by              text    DEFAULT 'created_at',
  sort_order           text    DEFAULT 'desc',
  page_number          integer DEFAULT 1,
  page_size            integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_offset   integer := GREATEST(0, (page_number - 1)) * page_size;
  v_total    bigint;
  v_products jsonb;
  v_sort_col text;
BEGIN
  v_sort_col := CASE sort_by
    WHEN 'price'       THEN 'price'
    WHEN 'views_count' THEN 'views_count'
    WHEN 'name'        THEN 'name'
    ELSE 'created_at'
  END;

  SELECT COUNT(*) INTO v_total
  FROM marketplace_products p
  WHERE
    (filter_available IS NULL     OR p.available = filter_available)
    AND (filter_category IS NULL  OR p.category = filter_category)
    AND (filter_culture IS NULL   OR p.culture = filter_culture)
    AND (filter_season IS NULL    OR p.season = filter_season)
    AND (filter_producer_type IS NULL OR p.producer_type = filter_producer_type)
    AND (filter_region_id IS NULL OR p.region_id = filter_region_id)
    AND (filter_prefecture_id IS NULL OR p.prefecture_id = filter_prefecture_id)
    AND (filter_cooperative_id IS NULL OR p.cooperative_id = filter_cooperative_id)
    AND (filter_min_price IS NULL OR p.price >= filter_min_price)
    AND (filter_max_price IS NULL OR p.price <= filter_max_price)
    AND (filter_certification IS NULL OR filter_certification = ANY(p.certification))
    AND (search_query IS NULL OR (
      p.name ILIKE '%' || search_query || '%'
      OR p.description ILIKE '%' || search_query || '%'
      OR p.culture ILIKE '%' || search_query || '%'
    ));

  SELECT jsonb_agg(row_to_json(r)) INTO v_products
  FROM (
    SELECT p.id, p.cooperative_id, p.name, p.description, p.category,
           p.culture, p.price, p.currency, p.unit, p.quantity_available,
           p.images, p.certification, p.season, p.producer_type,
           p.available, p.region_id, p.prefecture_id, p.views_count,
           p.orders_count, p.created_at,
           c.name AS cooperative_name, reg.name AS region_name
    FROM marketplace_products p
    LEFT JOIN cooperatives c ON c.id = p.cooperative_id
    LEFT JOIN regions reg ON reg.id = p.region_id
    WHERE
      (filter_available IS NULL     OR p.available = filter_available)
      AND (filter_category IS NULL  OR p.category = filter_category)
      AND (filter_culture IS NULL   OR p.culture = filter_culture)
      AND (filter_season IS NULL    OR p.season = filter_season)
      AND (filter_producer_type IS NULL OR p.producer_type = filter_producer_type)
      AND (filter_region_id IS NULL OR p.region_id = filter_region_id)
      AND (filter_prefecture_id IS NULL OR p.prefecture_id = filter_prefecture_id)
      AND (filter_cooperative_id IS NULL OR p.cooperative_id = filter_cooperative_id)
      AND (filter_min_price IS NULL OR p.price >= filter_min_price)
      AND (filter_max_price IS NULL OR p.price <= filter_max_price)
      AND (filter_certification IS NULL OR filter_certification = ANY(p.certification))
      AND (search_query IS NULL OR (
        p.name ILIKE '%' || search_query || '%'
        OR p.description ILIKE '%' || search_query || '%'
        OR p.culture ILIKE '%' || search_query || '%'
      ))
    ORDER BY
      CASE WHEN sort_order = 'asc' THEN
        CASE v_sort_col WHEN 'price' THEN p.price::text WHEN 'views_count' THEN p.views_count::text WHEN 'name' THEN p.name ELSE p.created_at::text END
      END ASC NULLS LAST,
      CASE WHEN sort_order != 'asc' THEN
        CASE v_sort_col WHEN 'price' THEN p.price::text WHEN 'views_count' THEN p.views_count::text WHEN 'name' THEN p.name ELSE p.created_at::text END
      END DESC NULLS LAST
    LIMIT page_size OFFSET v_offset
  ) r;

  RETURN jsonb_build_object(
    'products',    COALESCE(v_products, '[]'::jsonb),
    'total',       v_total,
    'page',        page_number,
    'page_size',   page_size,
    'total_pages', CEIL(v_total::numeric / NULLIF(page_size, 0))
  );
END;
$$;

GRANT EXECUTE ON FUNCTION search_marketplace TO anon, authenticated;
