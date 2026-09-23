-- Marché de proximité — les annonces deviennent la colonne vertébrale.
--
-- Deux blocages levés ici :
--
-- 1. PUBLICATION FERMÉE AUX PROFILS HAROO. `member_id` était NOT NULL et la
--    policy d'écriture exigeait une ligne `members` : un ouvrier, un acheteur
--    ou un agronome — qui n'appartient à aucune coopérative — ne pouvait rien
--    publier. On ajoute `author_id` (profiles.id), qui vaut pour tout compte,
--    et `member_id` devient facultatif : il ne sert plus qu'à rattacher une
--    annonce à une fiche membre quand elle existe.
--
-- 2. PROXIMITÉ INEXISTANTE. Seul `location_canton`, du texte libre, portait la
--    localisation — impossible à filtrer ni à trier de façon fiable. On passe
--    aux vraies clés de la hiérarchie région → préfecture → canton, déjà
--    utilisées par market_prices. Pas de GPS : les annonces n'ont pas de
--    coordonnées, et en saisir depuis un téléphone rural serait un autre
--    chantier. La proximité est donc administrative, ce qui suffit à
--    « près de chez moi ».
--
-- La table est vide à ce jour : aucune reprise de données nécessaire.

ALTER TABLE public.producer_announcements
  ALTER COLUMN member_id DROP NOT NULL,
  ADD COLUMN author_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN region_id uuid REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN prefecture_id uuid REFERENCES public.prefectures(id) ON DELETE SET NULL,
  ADD COLUMN canton_id uuid REFERENCES public.cantons(id) ON DELETE SET NULL,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

-- Une annonce est toujours rattachée à quelqu'un : un compte, une fiche
-- membre, ou les deux. Jamais orpheline.
ALTER TABLE public.producer_announcements
  ADD CONSTRAINT producer_announcements_has_owner
  CHECK (author_id IS NOT NULL OR member_id IS NOT NULL);

-- « mission » rejoint job/prevente : une demande de conseil agronomique se
-- publie et se cherche exactement comme le reste, au lieu de vivre dans une
-- table séparée que rien n'alimente (haroo_missions).
ALTER TABLE public.producer_announcements DROP CONSTRAINT producer_announcements_type_check;
ALTER TABLE public.producer_announcements ADD CONSTRAINT producer_announcements_type_check
  CHECK (type = ANY (ARRAY['job','prevente','mission','autre']));

-- Index taillés pour la requête du marché : annonces actives d'une zone,
-- les plus récentes d'abord.
CREATE INDEX producer_announcements_canton_idx
  ON public.producer_announcements(canton_id, created_at DESC) WHERE status = 'active';
CREATE INDEX producer_announcements_prefecture_idx
  ON public.producer_announcements(prefecture_id, created_at DESC) WHERE status = 'active';
CREATE INDEX producer_announcements_region_idx
  ON public.producer_announcements(region_id, created_at DESC) WHERE status = 'active';
CREATE INDEX producer_announcements_type_idx
  ON public.producer_announcements(type, created_at DESC) WHERE status = 'active';
CREATE INDEX producer_announcements_author_idx
  ON public.producer_announcements(author_id, created_at DESC);

-- Écriture : l'auteur est toujours le compte courant. On ne publie jamais
-- sous l'identité d'un autre, et rattacher une annonce à une fiche membre
-- exige de pouvoir agir sur ce membre (admin de l'organisation, ou le membre
-- lui-même). La lecture publique posée par le durcissement (#14) reste telle
-- quelle : status='active' visible de tous, y compris anonymes.
DROP POLICY IF EXISTS announcements_owner ON public.producer_announcements;
CREATE POLICY announcements_owner ON public.producer_announcements FOR ALL TO authenticated
  USING (
    author_id = (SELECT auth.uid())
    OR private.org_admin_access(cooperative_id)
    OR EXISTS (SELECT 1 FROM public.members m
               WHERE m.id = member_id AND private.owns_member(m.cooperative_id, m.email))
  )
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND (
      member_id IS NULL
      OR EXISTS (SELECT 1 FROM public.members m
                 WHERE m.id = member_id
                   AND m.cooperative_id IS NOT DISTINCT FROM cooperative_id
                   AND (private.org_admin_access(m.cooperative_id)
                        OR private.owns_member(m.cooperative_id, m.email)))
    )
  );

COMMENT ON COLUMN public.producer_announcements.author_id IS
  'Compte auteur de l''annonce (profiles.id). Renseigné pour toute publication, y compris par un profil Haroo sans ligne members.';
COMMENT ON COLUMN public.producer_announcements.canton_id IS
  'Localisation administrative — base du tri par proximité. location_canton (texte libre) est conservé pour l''historique mais n''est plus la source du filtrage.';
