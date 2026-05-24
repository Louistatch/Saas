-- Migration: verify_card RPC function
--
-- Returns ONLY columns confirmed to exist in the actual schema:
--   members: id, cooperative_id, first_name, last_name, email, phone, address,
--            date_of_birth, status, created_at, updated_at
--   cooperatives: id, name, faitiere_name (other fields)
--   member_cards: card_number, status, expiry_date, member_id, cooperative_id,
--                 created_at, qr_data
--
-- Sensitive fields (email, phone, address, date_of_birth) are NEVER returned.
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
'Public card verification used by /verify/[card_number]. SECURITY DEFINER bypasses anon REVOKE on members. Returns only public, non-sensitive fields.';
