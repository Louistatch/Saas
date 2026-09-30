-- Keep the untouched upload alongside the crop.
--
-- processPhotoFaceCrop() overwrote members.photo_url with the cropped variant,
-- so the source was lost: originals live in per-cooperative folders under
-- <timestamp>-<uuid>.<ext> with nothing tying them back to a member. When the
-- crop geometry changed from 1:1 to 7:9 there was therefore no way to re-crop
-- properly — only to re-crop the crop. This column makes every future change of
-- framing a re-run instead of a loss.
--
-- Appliqué en production sous le nom `members_photo_original_url`.
ALTER TABLE members ADD COLUMN IF NOT EXISTS photo_original_url TEXT;

COMMENT ON COLUMN members.photo_original_url IS
  'Photo telle que téléversée, avant recadrage. photo_url porte la variante -face.jpg servie sur la carte. Ne jamais écraser : c''est la seule source permettant de recadrer à nouveau.';
