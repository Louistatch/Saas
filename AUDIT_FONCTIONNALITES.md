# Audit fonctionnel — Carte professionnelle (agronome / technicien / conseiller)

Date : 2026-10-07. Audit en lecture seule (code FaîtiereHub, AgriTogo, base Supabase `hhnswekjgbxckluqnszo`).

## Contexte technique

- **Stack** : Next.js 16 / React 19 (Vercel) + Supabase partagé avec AgriTogo (Flask, Railway). Rendu carte : SVG → PNG via `@resvg/resvg-wasm` (`lib/card-engine/haroo-card.ts`, `app/api/haroo/card/route.ts`).
- **Modèles** :
  - `haroo_agronome_profiles` (id, user_id, card_number, first_name, last_name, phone, photo_url, specialisations[], canton_id, badge_valide, statut_validation, note_moyenne, nombre_missions, member_card_id). `haroo_ouvrier_profiles` / `haroo_acheteur_profiles` analogues, sans validation.
  - `member_cards` (id, cooperative_id, member_id, card_number, status, expiry_date, qr_data, card_type ∈ FAITIERE/OUVRIER/ACHETEUR/AGRONOME, deleted_at). Statuts observés : `active`, `expired` (+ valeurs libres côté FAITIERE).
  - `haroo_card_pins` (card_number, agronome_id, pin_hash, salt, failed_attempts, locked_until, issued_by, issued_at).
  - `techniciens` (faitiere_id, canton_id, name, phone) : simple annuaire de contacts, **pas** de profil/compte/carte.
  - `cooperatives` (level faitiere/union/cooperative, parent_id, logo_url, faitiere_name).
  - Stockage : buckets `member-photos` (public), `cooperative-logos`, etc. **Aucun bucket ni table de justificatifs/diplômes.**
- **Numéro de carte** : `PREFIX-NNNNNN` (AGR-/OUV-/ACH-), `lib/utils/card-number.ts` (`crypto.randomInt`, 900 000 combinaisons par préfixe).
- **Routes** : `POST /api/haroo/auth/register` (proxy AgriTogo `/api/v1/haroo/auth/register`), `GET /api/haroo/card` (PNG de sa carte), `POST /api/admin/haroo-cards` (issue / validate_agronome / issue_agronome_pin, super_admin), `GET /api/verify/[card_number]` (→ AgriTogo `/api/v1/haroo/verify/<card>`, `agritogo/app/haroo/verify.py`), `GET /api/haroo/agronomes` (annuaire), `GET /api/technicien/[card_number]`.
- **Écrans** : `app/auth/signup/haroo`, `app/haroo` (espace pro), `app/admin/haroo`, `app/verify/[card_number]` + `components/verify/agronome-view.tsx`, `app/agronomes`, `app/scan` (`components/shared/qr-scanner`).
- **Rôles** : `profiles.role` (super_admin, cooperative_admin, member, none) + `profiles.haroo_type` (ouvrier/acheteur/agronome). Pro Haroo créé avec `role='none'`, `cooperative_id=NULL` (`agritogo/app/haroo/auth.py:163`).
- **Tests** : Playwright `e2e/tests/01..06` (cartes membres, vérification) ; aucun test Haroo/agronome. `tests/*.test.mjs` sans couverture Haroo.

## Tableau

| Fonctionnalité | Statut avant | Preuves | Écarts | Statut après |
|---|---|---|---|---|
| F1 Carte numérique | PARTIELLE | `lib/card-engine/haroo-card.ts:130,197,199,209,235,243,261,267` | Logo texte FaîtiereHub, « CARTE PROFESSIONNELLE », photo, identifiant, QR présents. Manquent : qualification « Agronome certifié », badge « vérifié » conditionné à `badge_valide` (pastille statique « PROFIL VÉRIFIABLE »), « Membre validé par la faîtière », statut ACTIF, période de validité. Sous-titre générique « Membre de la communauté agricole ». | — |
| F2 Inscription pro | PARTIELLE | `lib/validators/schemas.ts:153-166`, `app/auth/signup/haroo/page.tsx:183`, `agritogo/app/haroo/auth.py:77-173` | Identité + téléphone uniquement. Spécialité non saisie à l'inscription (éditable après via `components/haroo/profile-editor.tsx`). Aucun upload de diplômes/justificatifs (ni bucket ni table). | — |
| F3 Validation par la faîtière | PARTIELLE | `app/api/admin/haroo-cards/route.ts:96-140`, `app/admin/haroo/page.tsx:183` | Valider/rejeter existe mais réservé à `super_admin`, pas aux admins de faîtière ; aucun justificatif à examiner ; pas de motif de rejet ni d'historique (qui/quand). Badge = `badge_valide` mis à true seulement par cette action (OK). | — |
| F4 Émission auto après validation | PARTIELLE | `app/api/admin/haroo-cards/route.ts:143-220` | Émission manuelle (action `issue` séparée), pas déclenchée par la validation. Id unique OK ; QR = URL du numéro, donc pas de jeton QR propre. Non transactionnel (insert puis update avec rollback manuel). `member_card_id` non renseigné. | — |
| F5 Scan smartphone | IMPLÉMENTÉE | `app/scan/page.tsx:6,47`, QR → `https://www.faitierehub.com/verify/<num>` (`haroo-card.ts:130`) | Fonctionne (appareil photo natif ou PWA). L'extraction attend le format numéro ; un futur jeton opaque demandera d'adapter le scanner. | — |
| F6 Page publique de vérification | PARTIELLE | `agritogo/app/haroo/verify.py:229,254`, `components/verify/agronome-view.tsx:109-125,411-425` | Sans compte : OK. Mais expose le **téléphone** (lien tel/WhatsApp), missions/notes ; pas de mention d'appartenance à une faîtière ; « Carte vérifiée » affiché même si non validé (l.202). Repli FaîtiereHub (`route.ts` étape 2bis) minimal. | — |
| F7 Statut & validité | PARTIELLE | `admin/haroo-cards/route.ts:28,201`, `verify.py:58-77`, `api/verify/route.ts:180-190` | Expiration 730 j calculée et contrôlée ; `active`/`expired`. Pas de statut `suspended` géré, pas d'action suspendre/révoquer/renouveler dans l'admin Haroo. | — |
| F8 Anti-fraude | PARTIELLE | `lib/utils/card-number.ts`, `api/verify/route.ts:85-110` | Vérification serveur OK, numéro aléatoire crypto. Mais QR = numéro de carte (6 chiffres, devinable/énumérable, rate-limit seul rempart, variantes O/0 élargissent l'espace), `qr_data` inutilisé, aucun jeton opaque ni signature. Révocation possible seulement en base (status). | — |
| F9 Visibilité expert | IMPLÉMENTÉE | `app/api/haroo/agronomes/route.ts`, `app/agronomes/page.tsx` | Annuaire des agronomes validés + carte active (sans téléphone ni numéro). Pas de page profil publique individuelle hors /verify. | — |
| F10 Rattachement faîtière | ABSENTE | colonnes des `haroo_*_profiles` (aucun `faitiere_id`), `auth.py:163-164` | Pros créés `cooperative_id=NULL`, carte `cooperative_id=null`. Carte affiche « Indépendant ». Hiérarchie `cooperatives.level/parent_id` existe mais non utilisée. | — |
| F11 « Demandez votre carte » ouvert aux techniciens/conseillers | ABSENTE | `harooSignupSchema` enum OUVRIER/ACHETEUR/AGRONOME ; table `techniciens` sans compte | Pas de profession technicien / conseiller agricole ; pas de CTA « Demandez votre carte professionnelle ». | — |
| F12 Identité visuelle | IMPLÉMENTÉE (partielle sur logo) | `haroo-card.ts:197`, thème `--vfp-*` des vues verify | Wordmark texte « FaîtiereHub », pas de logo image ; cohérent sur carte et page verify. | — |

## Points à trancher

1. **Qui valide (F3)** : super_admin seul, ou admin de la faîtière de rattachement (nécessite F10) ? Double validation ?
2. **Choix de la faîtière (F10)** : sélection à l'inscription (liste des `cooperatives` level=faitiere), invitation par la faîtière, ou dérivée du canton ? Union/coopérative intermédiaire ?
3. **Contenu du QR (F8)** : aujourd'hui `https://www.faitierehub.com/verify/<CARD_NUMBER>`. Passer à un jeton opaque (ex. `/verify/t/<token 128 bits>`, colonne dédiée ou `qr_data`) et garder la saisie manuelle du numéro ? Rotation du jeton au renouvellement/révocation ?
4. **Données publiques (F6)** : retirer téléphone et missions de la vue publique (et de `verify.py`) ? Contact via demande de mission seulement ?
5. **Émission (F4)** : auto à la validation (une transaction / RPC SECURITY DEFINER) + PIN généré dans la foulée ?
6. **Professions (F11)** : nouveaux `haroo_type` (technicien, conseiller) ou un seul profil « professionnel » avec champ profession ? Impact enum, préfixes de carte (TEC-, CON-), AgriTogo.
7. **Justificatifs (F2)** : bucket privé + table `professional_documents` (type, chemin, statut), accès faîtière via URL signée.
8. **F9** : l'annuaire suffit-il, ou faut-il une page profil public par expert ?
9. **Durée de validité / renouvellement (F7)** : 2 ans fixes ? Renouvellement = nouvelle date + nouveau jeton, même numéro ?
