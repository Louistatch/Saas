# 🧪 Guide de Test — Testeur 6 : Vérification QR & Mobile

## FaîtiereHub — Test de la plateforme

**URL du site** : https://faitierehub.com

---

## Votre compte de test

| | |
|---|---|
| **Email** | `admin@demo.local` |
| **Mot de passe** | `Demo123!SuperAdmin` |
| **Rôle** | Super Admin |

---

## Votre mission

Tester la **vérification par QR code** et l'expérience **mobile** globale du site.

---

## Tests à effectuer

### 1. Page de vérification (sans scanner)
- [ ] Ouvrir https://faitierehub.com/verify/FEN-66261 dans votre navigateur
- [ ] Vérifier : les infos du membre s'affichent (nom, photo, coopérative, validité)
- [ ] Le badge "MEMBRE VÉRIFIÉ ✓" est vert
- [ ] Les cotisations sont affichées (même si 0)
- [ ] Rafraîchir la page → elle s'affiche encore (pas de boucle)

### 2. QR code invalide
- [ ] Ouvrir https://faitierehub.com/verify/FAUX-12345
- [ ] Vérifier : message "Carte non trouvée dans le système"
- [ ] Pas de boucle infinie

### 3. Scanner un QR code réel
- [ ] Se connecter en tant que Super Admin
- [ ] Aller dans "Cartes membres"
- [ ] Télécharger une carte (icône ↓)
- [ ] Scanner le QR code de l'image avec votre téléphone
- [ ] Vérifier : le navigateur s'ouvre directement sur la page de vérification
- [ ] Les infos du membre sont correctes

### 4. Test mobile complet
- [ ] Ouvrir le site sur votre téléphone
- [ ] Naviguer entre les pages (menu hamburger)
- [ ] Se connecter sur mobile
- [ ] Accéder au dashboard sur mobile
- [ ] Vérifier que tout est lisible et utilisable

### 5. Panneau Admin (Super Admin)
- [ ] Connecté en tant que `admin@demo.local`
- [ ] Accéder à /admin
- [ ] Vérifier : statistiques globales affichées
- [ ] Aller dans "Coopératives" → liste des coopératives
- [ ] Aller dans "Utilisateurs" → liste des utilisateurs
- [ ] Aller dans "Logs d'audit" → historique des actions
- [ ] Aller dans "Paramètres" → page de configuration

### 6. Isolation des données (Super Admin)
- [ ] Dans le dashboard (/dashboard), utiliser le sélecteur de coopérative (en haut)
- [ ] Sélectionner "HAROFEMA" → voir les membres de HAROFEMA
- [ ] Sélectionner "FENOMAT" → voir les membres de FENOMAT
- [ ] Les données changent à chaque sélection

### 7. Page 404
- [ ] Aller sur https://faitierehub.com/page-qui-nexiste-pas
- [ ] Vérifier : page 404 avec boutons de retour (pas d'écran blanc)

### 8. Page 403 (accès refusé)
- [ ] Se connecter avec `member1@demo.local` / `Demo123!Member1`
- [ ] Essayer d'accéder à https://faitierehub.com/admin
- [ ] Vérifier : redirigé vers une page "Accès refusé" ou le dashboard

---

## Comment envoyer votre retour

Envoyez un message WhatsApp avec :
1. ✅ Ce qui marche
2. ❌ Ce qui ne marche pas (avec capture d'écran)
3. 📱 Votre appareil (ex: iPhone 12, Samsung A54, PC Chrome)
4. 💡 Suggestions d'amélioration

**Merci pour votre aide ! 🙏**
