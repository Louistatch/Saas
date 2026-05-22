# 🧪 Guide de Test — Testeur 4 : Cartes Membres

## FaîtiereHub — Test de la plateforme

**URL du site** : https://faitierehub.com

---

## Votre compte de test

| | |
|---|---|
| **Email** | `fenomat@demo.local` |
| **Mot de passe** | `Demo123!CoopAdmin` |
| **Rôle** | Admin Faîtière FENOMAT |

---

## Votre mission

Tester la **génération de cartes membres** : création, téléchargement, QR code, impression A4.

---

## Tests à effectuer

### 1. Accéder aux cartes
- [ ] Se connecter avec les identifiants ci-dessus
- [ ] Cliquer sur "Cartes membres" dans le menu
- [ ] La page s'affiche (liste des cartes ou "Aucune carte")

### 2. Générer une carte
- [ ] Cliquer "Générer une carte"
- [ ] Sélectionner une coopérative (HAROFEMA, COOMARA, etc.)
- [ ] Sélectionner un membre
- [ ] Choisir la durée de validité (365 jours)
- [ ] Cliquer "Générer la carte"
- [ ] Vérifier : la carte apparaît dans la liste avec statut "Active"

### 3. Télécharger la carte
- [ ] Cliquer sur l'icône de téléchargement (↓) à côté d'une carte
- [ ] Vérifier : une image PNG est téléchargée
- [ ] Ouvrir l'image : elle doit montrer le design premium (fond vert foncé, photo, QR code, infos)

### 4. Vérifier le QR code
- [ ] Scanner le QR code de la carte téléchargée avec votre téléphone
- [ ] Vérifier : le navigateur s'ouvre sur la page de vérification
- [ ] La page affiche : nom du membre, coopérative, faîtière, validité
- [ ] Scanner une deuxième fois → la page s'affiche encore (pas de boucle)

### 5. Révoquer une carte
- [ ] Cliquer sur l'icône poubelle (🗑️) à côté d'une carte active
- [ ] Confirmer la révocation
- [ ] Vérifier : le statut passe à "Révoquée"
- [ ] Scanner le QR code → la page affiche "CARTE RÉVOQUÉE"

### 6. Renouveler une carte
- [ ] Générer une nouvelle carte pour le même membre
- [ ] Vérifier : le MÊME numéro de carte est réutilisé (pas un nouveau)
- [ ] La date d'expiration est mise à jour

### 7. Impression A4
- [ ] Cliquer "Imprimer A4"
- [ ] Vérifier : 8 mini-cartes par page
- [ ] Cliquer "Imprimer en PDF" → le dialogue d'impression s'ouvre

### 8. Design de la carte
- [ ] La carte téléchargée ressemble-t-elle au design premium ?
- [ ] Photo du membre visible (ou silhouette si pas de photo)
- [ ] Nom, coopérative, faîtière, localité, téléphone affichés
- [ ] QR code lisible
- [ ] Date de validité correcte

---

## Comment envoyer votre retour

Envoyez un message WhatsApp avec :
1. ✅ Ce qui marche
2. ❌ Ce qui ne marche pas (avec capture d'écran)
3. 📱 Votre appareil (ex: iPhone 12, Samsung A54, PC Chrome)
4. 💡 Suggestions d'amélioration

**Merci pour votre aide ! 🙏**
