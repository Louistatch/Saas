-- Achats : au plus UNE demande de paiement en cours de création par compte
-- d'exploitation et par numéro Mobile Money.
--
-- NON APPLIQUÉE automatiquement. Purement additive : aucune ligne n'est
-- modifiée ni supprimée, et la route fusionnée fonctionne sans (elle se replie
-- alors sur sa relecture après insertion, au mieux).
--
-- ORDRE DE DÉPLOIEMENT : à appliquer SEULEMENT APRÈS la mise en ligne sur Vercel
-- du code fusionné (claude/magical-wright-iP5e8). Le code de main encore en ligne
-- (POST /api/fiches/[id]/purchase) laisse une ligne « pending » sans transaction
-- si la fonction s'arrête entre l'insertion et l'appel FedaPay, et n'a ni cron de
-- rapprochement ni nettoyage : cette ligne bloquerait ensuite toute nouvelle
-- tentative pour ce compte et ce numéro (23505 rendu en 500 « Achat impossible
-- pour le moment »), et un double clic donnerait aussi un 500. La route fusionnée
-- traite 23505 comme « demande concurrente » et passe en échec les lignes sans
-- transaction de plus de 15 min.
--
-- Le défaut : la reprise d'un paiement en cours était « vérifier puis
-- insérer » (POST /api/fiches/[id]/purchase). Deux requêtes simultanées
-- (double clic, deux onglets) passaient toutes deux la vérification, et
-- l'acheteur recevait DEUX demandes de paiement sur son téléphone. Les
-- instances serverless ne partagent rien en mémoire : seule la base tranche.
--
-- L'index : unique sur (fiche_id, buyer_phone) pour les achats « pending »
-- qui n'ont PAS encore de transaction FedaPay, c'est-à-dire pendant que la
-- demande de paiement est créée. buyer_phone est la clé de la ligne écrite
-- par la route (lib/fiches/phone.ts, mobileMoneyPhoneKey) : indicatif du pays
-- + numéro canonique, ex. +22890123456 ou +2290197000001. Ainsi 97 00 00 01
-- et 01 97 00 00 01 au Bénin sont une seule ligne, et 97 00 00 03 au Togo et
-- au Bénin, deux lignes. La 2e insertion échoue (23505) : la route relit l'achat
-- gagnant et le reprend, sans appeler FedaPay. Dès que la transaction est
-- enregistrée, l'achat sort de l'index ; une insertion arrivée après ce
-- moment est vue par la relecture qui suit toute insertion, et cède.
--
-- Pourquoi pas tous les « pending » :
--   1. la base en contient déjà en double pour une même fiche et un même
--      numéro (2 paires relevées le 19/10/2026) : l'index échouerait ;
--   2. un paiement abandonné reste « pending » jusqu'à 48 h (cron de
--      rapprochement) : il bloquerait l'acheteur tout ce temps, au lieu des
--      15 min prévues par la route.
--
-- Ne peut pas échouer sur les données existantes : la table est verrouillée en
-- écriture (SHARE, le verrou que CREATE INDEX prend de toute façon), puis le
-- prédicat est borné aux lignes créées APRÈS l'instant de la migration (borne
-- écrite en dur, au-delà de toute ligne présente) : aucune ligne existante
-- n'entre dans l'index. Idempotente : rien n'est fait si l'index existe déjà.
--
-- Retour arrière :
--   drop index if exists public.purchases_one_pending_request_uidx;

do $$
declare
  v_cutoff timestamptz;
begin
  if to_regclass('public.purchases_one_pending_request_uidx') is not null then
    return;
  end if;

  lock table public.purchases in share mode;

  select greatest(clock_timestamp(), coalesce(max(created_at), '-infinity'::timestamptz))
    into v_cutoff
    from public.purchases;

  execute format(
    'create unique index if not exists purchases_one_pending_request_uidx
       on public.purchases (fiche_id, buyer_phone)
       where payment_status = %L
         and provider_transaction_id is null
         and created_at > %L::timestamptz',
    'pending',
    to_char(v_cutoff at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
  );
end
$$;

comment on index public.purchases_one_pending_request_uidx is
  'Une seule demande de paiement en cours de création par fiche et par numéro (POST /api/fiches/[id]/purchase). Voir 20261019_100000_purchases_one_pending.sql.';
