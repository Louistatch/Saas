-- Backfill all cards with null qr_data
UPDATE member_cards
SET qr_data = 'https://www.faitierehub.com/verify/' || card_number
WHERE qr_data IS NULL OR qr_data = '';

-- Auto-fill qr_data on insert or update
CREATE OR REPLACE FUNCTION fill_card_qr_data()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.qr_data IS NULL OR NEW.qr_data = '' THEN
    NEW.qr_data := 'https://www.faitierehub.com/verify/' || NEW.card_number;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS member_cards_fill_qr ON member_cards;
CREATE TRIGGER member_cards_fill_qr
  BEFORE INSERT OR UPDATE OF qr_data, card_number
  ON member_cards
  FOR EACH ROW
  EXECUTE FUNCTION fill_card_qr_data();
