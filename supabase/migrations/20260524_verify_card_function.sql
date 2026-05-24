-- Migration: verify_card RPC function
--
-- Replaces the broken member_cards_public view that fails because anon was revoked
-- access to underlying tables (members, cooperatives, etc.).
--
-- This function is SECURITY DEFINER so it runs with the creator's privileges,
-- bypassing the anon REVOKE on members/cooperatives.
--
-- It returns ONLY the public fields needed by the verify page:
-- - card info (number, status, expiry, creation)
-- - member info (name, photo, location)
-- - cooperative info (name, faitiere)
--
-- Sensitive fields (phone, email, member_id, address, cotisations) are NEVER returned.
--
-- Apply via: Supabase SQL Editor or `supabase migration up`

CREATE OR REPLACE FUNCTION public.verify_card(p_card_numbers text[])
RETURNS TABLE (
  card_number       text,
  card_status       text,
  expiry_date       date,
  card_created_at   timestamptz,
  first_name        text,
  last_name         text,
  photo_url         text,
  village           text,
  canton            text,
  prefecture        text,
  region            text,
  member_status     text,
  member_since      timestamptz,
  cooperative_name  text,
  faitiere_name     text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    mc.card_number,
    mc.status::text         AS card_status,
    mc.expiry_date,
    mc.created_at           AS card_created_at,
    m.first_name,
    m.last_name,
    m.photo_url,
    m.village,
    cant.name               AS canton,
    pref.name               AS prefecture,
    reg.name                AS region,
    m.status::text          AS member_status,
    m.created_at            AS member_since,
    coop.name               AS cooperative_name,
    coop.faitiere_name      AS faitiere_name
  FROM member_cards mc
  JOIN members m         ON m.id = mc.member_id
  JOIN cooperatives coop ON coop.id = mc.cooperative_id
  LEFT JOIN cantons     cant ON cant.id = m.canton_id
  LEFT JOIN prefectures pref ON pref.id = COALESCE(cant.prefecture_id, m.prefecture_id)
  LEFT JOIN regions     reg  ON reg.id  = COALESCE(pref.region_id, m.region_id)
  WHERE mc.card_number = ANY(p_card_numbers)
  LIMIT 1;
$$;

-- Allow the anon role to call this RPC (the function itself enforces what is exposed)
GRANT EXECUTE ON FUNCTION public.verify_card(text[]) TO anon, authenticated;

COMMENT ON FUNCTION public.verify_card(text[]) IS
'Public card verification function used by /verify/[card_number]. SECURITY DEFINER bypasses anon REVOKE on members/cooperatives. Accepts an array of card numbers (for O/0 and I/1 ambiguity tolerance) and returns the first match.';
