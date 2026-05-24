-- Migration: verify_card RPC function
--
-- Replaces the broken member_cards_public view that fails because anon was revoked
-- access to underlying tables (members, cooperatives, etc.).
--
-- This function is SECURITY DEFINER so it runs with the creator's privileges,
-- bypassing the anon REVOKE on members/cooperatives.
--
-- NOTE: members table uses TEXT columns for village/canton/prefecture/region
-- (not FK references — the cantons table doesn't even exist).
--
-- Apply via: Supabase SQL Editor

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
    mc.status::text,
    mc.expiry_date,
    mc.created_at,
    m.first_name,
    m.last_name,
    m.photo_url,
    m.village,
    m.canton,
    m.prefecture,
    m.region,
    m.status::text,
    m.created_at,
    coop.name,
    coop.faitiere_name
  FROM member_cards mc
  JOIN members m         ON m.id = mc.member_id
  JOIN cooperatives coop ON coop.id = mc.cooperative_id
  WHERE mc.card_number = ANY(p_card_numbers)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.verify_card(text[]) TO anon, authenticated;

COMMENT ON FUNCTION public.verify_card(text[]) IS
'Public card verification used by /verify/[card_number]. SECURITY DEFINER to bypass anon REVOKE on members/cooperatives. Returns only public fields.';
