# 🧪 Guide de Test — Testeur 3 : Gestion des Membres

## FaîtiereHub — Test de la plateforme

**URL du site** : https://faitierehub.com

---

## Votre compte de test

| | |
|---|---|
| **Email** | `coop-admin@demo.local` |
| **Mot de passe** | `Demo123!CoopAdmin` |
| **Rôle** | Admin de la coopérative HAROFEMA |

---

## Votre mission

Tester la **gestion des membres** : ajout, modification, suppression, et vérifier l'isolation des données (vous ne devez voir QUE les membres de HAROFEMA).

---

## Tests à effectuer

### 1. Accéder à la page Membres
- [ ] Se connecter avec les identifiants ci-dessus
- [ ] Cliquer sur "Membres" dans le menu à gauche
- [ ] La liste des membres s'affiche (ou "Aucun membre")

### 2. Ajouter un membre
- [ ] Cliquer "Ajouter un membre"
- [ ] Remplir : Prénom, Nom, Téléphone (+228...)
- [ ] Ajouter une photo (optionnel)
- [ ] Sélectionner une localisation (Région → Préfecture → Canton)
- [ ] Cliquer "Ajouter le membre"
- [ ] Vérifier : le membre apparaît dans la liste

### 3. Modifier un membre
- [ ] Cliquer sur l'icône crayon (✏️) à côté d'un membre
- [ ] Modifier le numéro de téléphone
- [ ] Cliquer "Enregistrer"
- [ ] Vérifier : la modification est sauvegardée

### 4. Supprimer un membre
- [ ] Cliquer sur l'icône poubelle (🗑️) à côté d'un membre
- [ ] Confirmer la suppression
- [ ] Vérifier : le membre disparaît de la liste

### 5. Recherche
- [ ] Taper un nom dans la barre de recherche
- [ ] Vérifier : seuls les membres correspondants s'affichent
- [ ] Effacer la recherche → tous les membres réapparaissent

### 6. Isolation des données (IMPORTANT)
- [ ] Vérifier que vous ne voyez QUE les membres de HAROFEMA
- [ ] Se déconnecter
- [ ] Se reconnecter avec `fermes-admin@demo.local` / `Demo123!FarmesAdmin`
- [ ] Vérifier : les membres sont DIFFÉRENTS (coopérative COOMARA)
- [ ] Les membres de HAROFEMA ne sont PAS visibles

### 7. Scroll du formulaire
- [ ] Ouvrir le formulaire d'ajout de membre
- [ ] Vérifier que vous pouvez scroller jusqu'en bas (localisation visible)
- [ ] Tester sur mobile : le formulaire est-il utilisable ?

---

## Comment envoyer votre retour

Envoyez un message WhatsApp avec :
1. ✅ Ce qui marche
2. ❌ Ce qui ne marche pas (avec capture d'écran)
3. 📱 Votre appareil (ex: iPhone 12, Samsung A54, PC Chrome)
4. 💡 Suggestions d'amélioration

**Merci pour votre aide ! 🙏**
