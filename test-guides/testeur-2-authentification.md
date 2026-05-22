# 🧪 Guide de Test — Testeur 2 : Authentification

## FaîtiereHub — Test de la plateforme

**URL du site** : https://faitierehub.com

---

## Vos comptes de test

| Rôle | Email | Mot de passe |
|------|-------|-------------|
| Super Admin | `admin@demo.local` | `Demo123!SuperAdmin` |
| Admin Coopérative | `coop-admin@demo.local` | `Demo123!CoopAdmin` |
| Membre | `member1@demo.local` | `Demo123!Member1` |

---

## Votre mission

Tester la **connexion, déconnexion, et changement de compte**. Vérifier qu'il n'y a pas de bug quand on se connecte/déconnecte plusieurs fois.

---

## Tests à effectuer

### 1. Connexion Super Admin
- [ ] Aller sur https://faitierehub.com/auth/login
- [ ] Entrer `admin@demo.local` / `Demo123!SuperAdmin`
- [ ] Cliquer "Se connecter"
- [ ] Vérifier : redirigé vers /admin (panneau administrateur)
- [ ] Le nom "Admin" apparaît dans la sidebar

### 2. Déconnexion
- [ ] Cliquer sur "Déconnexion" dans la sidebar
- [ ] Vérifier : retour à la page de connexion
- [ ] Vérifier : impossible d'accéder à /admin sans se reconnecter

### 3. Connexion Admin Coopérative
- [ ] Se connecter avec `coop-admin@demo.local` / `Demo123!CoopAdmin`
- [ ] Vérifier : redirigé vers /dashboard (pas /admin)
- [ ] Le nom de la coopérative "HAROFEMA" apparaît

### 4. Changement de compte
- [ ] Se déconnecter
- [ ] Se reconnecter avec `member1@demo.local` / `Demo123!Member1`
- [ ] Vérifier : les données affichées sont différentes (pas celles de l'admin)
- [ ] Les menus admin ne sont PAS visibles

### 5. Mauvais mot de passe
- [ ] Essayer de se connecter avec un mauvais mot de passe
- [ ] Vérifier : message d'erreur affiché (pas de boucle infinie)
- [ ] Le bouton "Se connecter" redevient cliquable

### 6. Session expirée
- [ ] Se connecter normalement
- [ ] Attendre 5 minutes sans rien faire
- [ ] Rafraîchir la page
- [ ] Vérifier : soit la session est maintenue, soit on est redirigé vers login (pas d'écran blanc)

### 7. Multi-onglets
- [ ] Se connecter dans un onglet
- [ ] Ouvrir un deuxième onglet sur le même site
- [ ] Se déconnecter dans le premier onglet
- [ ] Vérifier : le deuxième onglet redirige aussi vers login

---

## Comment envoyer votre retour

Envoyez un message WhatsApp avec :
1. ✅ Ce qui marche
2. ❌ Ce qui ne marche pas (avec capture d'écran)
3. 📱 Votre appareil (ex: iPhone 12, Samsung A54, PC Chrome)
4. 💡 Suggestions d'amélioration

**Merci pour votre aide ! 🙏**
