# Audit technique — FaîtiereHub

Date : 11 octobre 2026. Périmètre : dépôt `Louistatch/Saas` (commit de départ `8c9958f`) et base
Supabase de production `hhnswekjgbxckluqnszo`, en **lecture seule**.

Étiquettes : **VÉRIFIÉ** (commande ou requête exécutée, résultat observé), **CODE** (constaté à la
lecture du code, non exécuté), **DÉCLARÉ** (par le fondateur), **NON VÉRIFIÉ**.

## 1. Synthèse

| Domaine | État | Étiquette |
|---|---|---|
| Compilation TypeScript | 0 erreur | VÉRIFIÉ |
| Build de production (`next build`) | réussi | VÉRIFIÉ |
| Tests unitaires et de durcissement | 24 + 32 tests, tous verts | VÉRIFIÉ |
| Contrôles de sécurité statiques (`security:check --static`) | 11/11 | VÉRIFIÉ |
| Lint Biome | 393 diagnostics, dont ~388 de formatage et 5 règles | VÉRIFIÉ |
| Dépendances (`npm audit --omit=dev`) | 5 hautes, 22 modérées, 0 critique | VÉRIFIÉ |
| RLS activé sur toutes les tables publiques | oui | VÉRIFIÉ |
| Isolation entre organisations en lecture | aucune fuite sur 15 tables testées | VÉRIFIÉ |
| Isolation en écriture | conforme d'après les politiques | CODE (non exécuté) |
| Identifiants de production publiés | **oui, dont un super_admin** | VÉRIFIÉ (comptes existants) |
| Facturation / abonnements | absente | CODE |

## 2. Inventaire

- Next.js 16.3.8, React 19, Supabase (`supabase-js` 2.105, `@supabase/ssr` 0.10), Zod, Sentry,
  PostHog, web-push, Upstash (limitation de débit), OpenAI et Google Generative AI. Paiements
  FedaPay, CinetPay et Orange Money codés à la main (`lib/payments/`). VÉRIFIÉ.
- **153 routes API** et **91 pages**. VÉRIFIÉ.
- CI (`.github/workflows/ci.yml`) : installation, typecheck, `test:hardening`,
  `security:check --static`, build. Le lint n'est qu'informatif. Les **tests E2E Playwright
  (46 tests) ne tournent pas en CI**. Avant cet audit, 6 fichiers de tests unitaires n'étaient
  lancés nulle part : corrigé (`npm run test:unit`). VÉRIFIÉ.
- Fichiers générés suivis par Git (`playwright-report/`, `test-results/`) : retirés du suivi.
- Le paquet s'appelle encore `"my-project"`. Des dépendances lourdes servent une seule fonction
  (`playcanvas`, deux SDK d'IA).

## 3. Modules

| Module | État | Preuve |
|---|---|---|
| Membres, cartes à QR, vérification de carte, cotisations, parcelles, carnet, marketplace, AgriMarket, crédit, académie, matching, statistiques, intégration Kobo, widget | FONCTIONNEL | lectures/écritures Supabase et routes API (CODE) |
| Administration (organisations, utilisateurs et rôles, messages, doublons, cartes et PIN, erreurs) | FONCTIONNEL | CODE ; plusieurs écrans utilisés en production |
| Espace opérateur (dossiers, messages, formation, certification) | FONCTIONNEL | CODE |
| Paramètres : « Passer au plan supérieur (bientôt disponible) », quota fixe `/ 500`, « essai 30 jours » | PARTIEL | `app/dashboard/settings/page.tsx` |
| Intégrations Google Sheets, e-mail, paiement | VITRINE | `available: false` dans `app/dashboard/integrations/page.tsx` |
| HarooLife (village, équipes d'ouvriers) | PILOTE | derrière drapeaux, sans contrat ni paiement (`docs/haroolife-pilot.md`) |
| Blog, pages marketing | VITRINE | contenu statique |
| Abonnements organisationnels | ABSENT | aucun code ; extension manuelle des quotas de cartes |

## 4. Constats de sécurité (du plus grave au plus faible)

### CRITIQUE

**S1. Identifiants de comptes de production publiés.** La page publique `/demo` affichait en clair
les e-mails et mots de passe de 7 comptes, recopiés aussi dans plusieurs documents du dépôt et dans
son historique Git. En base, ces comptes existent : `admin@demo.local` est **super_admin** (dernière
connexion le 11/10/2026), `fenomat@demo.local` et `coop-admin@demo.local` administrent **FENOMAT**,
organisation réelle (`is_demo = false`). Il n'a pas été vérifié que les mots de passe publiés sont
encore valides : nous ne nous connectons pas aux comptes de tiers. *Scénario :* quiconque lit la page
ou le dépôt se connecte en super_admin et accède à toutes les données personnelles.
*Correctif réalisé (branche) :* page `/demo` sans identifiants, mots de passe retirés des documents
et des tests. *Action requise du fondateur, en production :* changer immédiatement le mot de passe
de ces 7 comptes (en priorité `admin@demo.local`), ou les désactiver, puis invalider leurs
sessions. Les mots de passe restent dans l'historique Git : il faut les considérer comme compromis.

### ÉLEVÉ

**S2. Promotion d'un compte choisi par le demandeur lors de l'approbation d'une demande d'accès.**
Le texte libre de la demande pouvait contenir une fausse ligne « Compte existant à promouvoir :
<uuid> », lue par l'approbation. *Correctif réalisé :* seul l'en-tête écrit par le serveur est lu ;
les champs d'une ligne ne peuvent plus contenir de saut de ligne. Test de non-régression ajouté
(échoue avant, passe après). *Reste :* la politique `contact_messages_public_insert` (`WITH CHECK
true`) permet d'écrire directement dans la table : corrigée dans la migration préparée.

**S3. Attribution d'une organisation au premier compte créé avec l'e-mail du contact.** Recherche
par `ilike` (jokers `_` et `%`) et e-mails non confirmés acceptés. *Correctif réalisé :* égalité
exacte et refus si l'adresse du compte existant n'est pas confirmée.

**S4. Photos des membres listables publiquement.** Le bucket `member-photos` est public et une
politique de lecture permet à n'importe qui d'en énumérer les fichiers (12 photos de visages).
VÉRIFIÉ. *Correctif préparé (non appliqué) :* suppression de la politique de listage ; les adresses
publiques déjà affichées restent valides. *Étape suivante :* bucket privé et URL signées.

### MOYEN

- **S5.** Un simple membre peut remplacer ou supprimer les photos et logos de son organisation
  (politiques Storage fondées sur `get_accessible_cooperative_ids`). *Préparé dans la migration.*
- **S6.** Chaque membre lit les scores ATS de toute sa coopérative. VÉRIFIÉ (6 scores lus par un
  membre). *Préparé dans la migration.*
- **S7.** Redirection ouverte après connexion (`?redirect=/\evil.com`). *Corrigé et vérifié* sur
  8 cas d'attaque.
- **S8.** Les administrateurs de coopérative peuvent encore modifier ou réactiver une carte
  (`cards_update`), alors que l'émission est réservée aux opérateurs. Décision produit requise.
- **S9.** Les numéros de carte révoqués sont réutilisés lors d'un renouvellement
  (`app/dashboard/cards/page.tsx`). Une carte perdue peut redevenir valide.
- **S10.** Unicité du téléphone inefficace : numéros non normalisés (`92548838` et
  `+228 92 54 88 38` coexistent).
- **S11.** Sélections sans limite : PostgREST s'arrête à 1 000 lignes, donc statistiques et
  recherches fausses au-delà (membres, carte, rapports).
- **S12.** Callbacks CinetPay des commandes de cartes et des opérateurs : montant et devise non
  comparés à la commande (contrôle présent pour les cotisations).
- **S13.** Téléphones des techniciens et des coordinateurs lisibles sans connexion (`techniciens`,
  `cooperatives.coordo_phone`).

### FAIBLE

- Protection contre les mots de passe compromis (HaveIBeenPwned) désactivée dans Supabase Auth.
- Droits `TRUNCATE` accordés à `anon`/`authenticated` (sans effet via l'API, hygiène). *Préparé.*
- Dépendances : 5 vulnérabilités hautes (`sharp`, `fast-uri`, `brace-expansion`, `browserslist`,
  `source-map-js`) ; mise à jour à planifier.
- 77 politiques permissives multiples et 45 appels `auth.uid()` non mis en cache (performance RLS),
  81 clés étrangères sans index.
- La fonction `bootstrap_cooperative_admin` est accordée à `authenticated` dans le dépôt alors
  qu'elle ne l'est plus en production : écart dépôt / base. *Aligné dans la migration.*

### Points vérifiés conformes

Toutes les tables publiques ont RLS ; les 4 vues sont `security_invoker` ; les 40 fonctions
`SECURITY DEFINER` ont un `search_path` fixe. Aucune fuite entre organisations en lecture, sur
15 tables, pour un administrateur, un membre et un visiteur anonyme. Le trigger
`protect_profile_privileges` interdit de s'attribuer un rôle. Les routes API qui utilisent le
client service_role ont toutes un garde ou une justification publique. Les PIN et la connexion
par carte sont protégés contre la force brute. Aucun secret réel n'a été trouvé dans le code.

## 5. Préparation à la vente B2B

| Exigence | État |
|---|---|
| Facturation récurrente (abonnement, facture, relance) | ABSENT |
| Contrat type, CGV, accord de niveau de service | MANQUANT (le SLA de 99,9 % affiché n'existait pas : retiré) |
| Conformité données personnelles (loi togolaise 2019-014, IPDCP) | MANQUANT |
| Export des données d'une organisation | NON VÉRIFIÉ |
| Onboarding d'une organisation | fonctionnel via demande d'accès + approbation manuelle |
| Support | messagerie intégrée (réponses visibles dans le tableau de bord) |
| Tests de bout en bout en CI | ABSENT |

**Conclusion :** le produit est techniquement solide pour un MVP : architecture multi-organisations
sérieuse, RLS et tests d'isolation. Mais il n'est pas prêt pour une vente B2B facturée. Il manque
la facturation, le cadre contractuel et la conformité des données. Et le constat S1 doit être
traité avant toute démonstration à un tiers.

## 6. Corrections réalisées dans la branche `claude/lucid-pascal-fwb714`

| # | Problème | Correction | Preuve |
|---|---|---|---|
| 1 | S1 identifiants publiés | `/demo` réécrite, secrets retirés de 11 fichiers, tests E2E sans mot de passe par défaut | grep : 0 occurrence restante |
| 2 | S2 injection dans les demandes d'accès | lecture de l'en-tête seul, champs sur une ligne | test ajouté : échoue avant, passe après |
| 3 | S3 attribution par e-mail | égalité exacte + adresse confirmée | typecheck ; e-mails tous en minuscules en base (18/18) |
| 4 | S7 redirection ouverte | origine résolue et comparée | 8 cas d'attaque |
| 5 | Chiffres marketing non étayés | « 10 000+ membres », « 99,9 % garantie », « < 2 h » remplacés par des capacités vérifiables | page `/entreprise` |
| 6 | Tests non exécutés | `npm run test:unit` + étape CI | 24 tests verts |
| 7 | S4, S5, S6, droits, alignement | migration `20261012_090000_security_hardening.sql` **non appliquée** + retour arrière | exécutée sur PostgreSQL 16 local (aller et retour OK) |
