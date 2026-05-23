# Guide de Tests — SaaS Embeddable / White-Label

## 1. Tests du SDK JavaScript (`faitierehub-embed.js`)

### Tests fonctionnels

| # | Test | Code | Résultat attendu |
|---|------|------|-----------------|
| 1 | Init avec config minimale | `FaitierehHub.init({ cooperativeId: 'xxx', container: '#widget' })` | iframe créé dans le container |
| 2 | Init sans cooperativeId | `FaitierehHub.init({ container: '#widget' })` | Console error, pas d'iframe |
| 3 | Init sans container | `FaitierehHub.init({ cooperativeId: 'xxx' })` | Console error |
| 4 | Container string selector | `container: '#my-div'` | Trouve l'élément par querySelector |
| 5 | Container DOM element | `container: document.getElementById('x')` | Utilise l'élément directement |
| 6 | Widget par défaut | Pas de `widget` dans config | Charge 'marketplace' |
| 7 | Widget spécifique | `widget: 'member_verify'` | iframe src contient `widget=member_verify` |
| 8 | Theme override | `theme: { primaryColor: '#ff0000' }` | iframe src contient theme encodé |
| 9 | Destroy instance | `FaitierehHub.destroy(instance)` | iframe supprimé du DOM |
| 10 | DestroyAll | `FaitierehHub.destroyAll()` | Tous les iframes supprimés |
| 11 | Auto-init data attributes | `<div data-faitierehub data-cooperative-id="xxx">` | iframe créé au DOMContentLoaded |
| 12 | Multiple widgets | 2 divs avec data-faitierehub | 2 iframes créés |
| 13 | Auto-resize | Widget change de hauteur | iframe.style.height mis à jour |
| 14 | Navigate message | Widget envoie navigate | window.open() appelé |

### Tests d'intégration plateforme

| # | Plateforme | Méthode | Test |
|---|-----------|---------|------|
| 1 | WordPress | Script tag + div | Widget s'affiche dans un article |
| 2 | WordPress | Shortcode custom | Widget dans un widget sidebar |
| 3 | Webflow | Embed code block | Widget dans une section |
| 4 | HTML statique | Script + data attributes | Widget auto-initialisé |
| 5 | React app | SDK programmatique | Init dans useEffect, destroy dans cleanup |
| 6 | Vue app | SDK programmatique | Init dans mounted, destroy dans unmounted |

### Tests de compatibilité navigateur

| # | Navigateur | Version min | Test |
|---|-----------|-------------|------|
| 1 | Chrome | 80+ | Widget fonctionne |
| 2 | Firefox | 78+ | Widget fonctionne |
| 3 | Safari | 14+ | Widget fonctionne |
| 4 | Edge | 80+ | Widget fonctionne |
| 5 | Chrome Android | 80+ | Widget responsive |
| 6 | Safari iOS | 14+ | Widget responsive |
| 7 | Samsung Internet | 14+ | Widget fonctionne |

---

## 2. Tests du Widget Page (`/embed/widget`)

### Tests fonctionnels

| # | Scénario | Params | Résultat attendu |
|---|----------|--------|-----------------|
| 1 | Sans cooperative_id | `?widget=marketplace` | Message "Configuration manquante" |
| 2 | Marketplace vide | cooperative_id valide, 0 produits | "Aucun produit disponible" |
| 3 | Marketplace avec produits | cooperative_id avec produits | Grid de ProductCards |
| 4 | Member verify - carte valide | Entrer numéro valide | Affiche info membre + vert |
| 5 | Member verify - carte invalide | Entrer numéro invalide | Message erreur rouge |
| 6 | Member verify - carte expirée | Carte avec expiry passée | "Votre carte a expiré" |
| 7 | Fiches widget | cooperative_id avec fiches | Liste de fiches avec prix |
| 8 | Dashboard widget | cooperative_id valide | Stats membres + produits |
| 9 | Theme appliqué | `?theme={"primaryColor":"#f00"}` | CSS variable --primary = #f00 |
| 10 | Header coopérative | cooperative avec logo | Logo + nom affichés |
| 11 | Footer FaîtiereHub | Tout widget | Lien "Propulsé par FaîtiereHub" |
| 12 | Auto-resize postMessage | Contenu change de taille | Message envoyé au parent |

### Tests responsive

| # | Viewport | Widget | Résultat attendu |
|---|----------|--------|-----------------|
| 1 | 320px (mobile) | marketplace | 1 colonne, cards empilées |
| 2 | 640px (tablet) | marketplace | 2 colonnes |
| 3 | 1024px (desktop) | marketplace | 2 colonnes (dans iframe) |
| 4 | 320px | member_verify | Input + bouton empilés |
| 5 | 320px | dashboard | 2 colonnes stats |
| 6 | 320px | fiches | Liste verticale |

---

## 3. Tests de l'API Embed (`/api/embed`)

### Tests fonctionnels

| # | Scénario | Requête | Code | Réponse |
|---|----------|---------|------|---------|
| 1 | Requête valide | `?cooperative_id=xxx&widget=marketplace` | 200 | `{ cooperative, theme, widget, data }` |
| 2 | Sans cooperative_id | `GET /api/embed` | 400 | `{ error: 'cooperative_id required' }` |
| 3 | Cooperative inexistante | `?cooperative_id=fake-uuid` | 404 | Error |
| 4 | Embed non activé | cooperative sans embed_config enabled | 404 | Error |
| 5 | Widget marketplace | `?widget=marketplace` | 200 | `data.products` est un array |
| 6 | Widget fiches | `?widget=fiches` | 200 | `data.fiches` est un array |
| 7 | Widget member_verify | `?widget=member_verify` | 200 | `data.verify_endpoint` présent |
| 8 | Widget dashboard | `?widget=dashboard` | 200 | `data.stats.members` et `data.stats.products` |
| 9 | Widget non activé | Widget pas dans config.widgets | 403 | Error |
| 10 | Origin autorisée | Origin: good.com, allowed=['good.com'] | 200 | OK |
| 11 | Origin refusée | Origin: evil.com, allowed=['good.com'] | 403 | Error |
| 12 | Pas d'origin (direct) | Pas de header Origin | 200 | OK (pas de validation) |
| 13 | allowed_origins vide | `[]` | 200 | Tout autorisé |
| 14 | Rate limit | 61 requêtes en 60s | 429 | Error |
| 15 | CORS preflight | OPTIONS | 204 | Headers CORS |
| 16 | Cache headers | GET valide | 200 | `s-maxage=60, stale-while-revalidate=300` |

### Tests de sécurité

| # | Test | Méthode | Résultat attendu |
|---|------|---------|-----------------|
| 1 | Injection cooperative_id | `?cooperative_id='; DROP TABLE--` | 400 (pas un UUID) |
| 2 | XSS dans widget param | `?widget=<script>` | 403 (pas dans la liste) |
| 3 | Accès données privées | Widget marketplace | Seuls les produits available=true |
| 4 | Cross-tenant | cooperative_id d'un autre tenant | Données de CE tenant uniquement |
| 5 | Enumeration | IDs séquentiels | UUIDs non prédictibles |

---

## 4. Tests de la Config Embed (`/dashboard/embed`)

### Tests UI

| # | Action | Résultat attendu |
|---|--------|-----------------|
| 1 | Charger la page | Formulaire avec config actuelle ou défauts |
| 2 | Toggle enabled | Switch change d'état |
| 3 | Activer widget | Switch widget → ajouté à la liste |
| 4 | Désactiver widget | Switch widget → retiré de la liste |
| 5 | Ajouter origine | Taper URL + Ajouter → Badge apparaît |
| 6 | Supprimer origine | Cliquer sur badge → Badge disparaît |
| 7 | Changer couleur | Color picker → Valeur mise à jour |
| 8 | Domaine custom | Entrer domaine → Sauvegardé |
| 9 | Sauvegarder | Cliquer Sauvegarder → Toast "Configuration sauvegardée" |
| 10 | Copier code (auto) | Cliquer copier → Clipboard contient le snippet |
| 11 | Copier code (iframe) | Tab iframe + copier → Code iframe |
| 12 | Copier code (SDK) | Tab SDK + copier → Code SDK |
| 13 | Aperçu lien | Cliquer "Voir en plein écran" → Ouvre /embed/widget |

### Tests de persistance

| # | Action | Vérification |
|---|--------|-------------|
| 1 | Sauvegarder config | Recharger page → Config identique |
| 2 | Changer widgets | Recharger → Widgets corrects |
| 3 | Changer theme | Recharger → Couleur correcte |
| 4 | Ajouter origines | Recharger → Origines présentes |
| 5 | Désactiver embed | API /api/embed retourne 404 |
| 6 | Réactiver embed | API /api/embed retourne 200 |

---

## 5. Tests iframe Sandbox

### Sécurité iframe

| # | Test | Méthode | Résultat attendu |
|---|------|---------|-----------------|
| 1 | Scripts autorisés | `allow-scripts` dans sandbox | JS fonctionne dans l'iframe |
| 2 | Same-origin autorisé | `allow-same-origin` | Cookies/localStorage accessibles |
| 3 | Popups autorisés | `allow-popups` | window.open() fonctionne |
| 4 | Forms autorisés | `allow-forms` | Formulaire de vérification fonctionne |
| 5 | Top navigation bloquée | Pas de `allow-top-navigation` | iframe ne peut pas rediriger le parent |
| 6 | Downloads bloqués | Pas de `allow-downloads` | Pas de téléchargement depuis l'iframe |

### Communication parent ↔ iframe

| # | Test | Direction | Résultat attendu |
|---|------|-----------|-----------------|
| 1 | Resize message | iframe → parent | Parent met à jour iframe.style.height |
| 2 | Navigate message | iframe → parent | Parent ouvre window.open() |
| 3 | Origin vérifiée | iframe → parent | Parent vérifie event.origin |
| 4 | Message invalide | iframe → parent | Parent ignore silencieusement |
| 5 | JSON malformé | iframe → parent | try/catch, pas de crash |

---

## 6. Tests White-Label / Multi-tenant

### Isolation des données

| # | Test | Méthode | Résultat attendu |
|---|------|---------|-----------------|
| 1 | Produits isolés | Widget coop A | Seuls les produits de coop A |
| 2 | Fiches isolées | Widget coop A | Seules les fiches de coop A |
| 3 | Stats isolées | Widget coop A | Stats de coop A uniquement |
| 4 | Branding isolé | Widget coop A | Logo/couleur de coop A |
| 5 | Config isolée | Admin coop A | Ne voit pas config coop B |

### Personnalisation

| # | Test | Config | Résultat attendu |
|---|------|--------|-----------------|
| 1 | Couleur primaire | `primaryColor: '#e11d48'` | Boutons/liens en rose |
| 2 | Border radius | `borderRadius: '16px'` | Cards plus arrondies |
| 3 | Font family | `fontFamily: 'Georgia'` | Texte en Georgia |
| 4 | Logo custom | `logo_url: 'https://...'` | Logo affiché dans le header |
| 5 | Domaine custom | `custom_domain: 'market.faitiere.org'` | Accessible via ce domaine |

---

## 7. Tests de Performance Embed

| # | Métrique | Seuil | Comment mesurer |
|---|----------|-------|-----------------|
| 1 | Taille SDK JS | < 3 KB | `wc -c public/embed/faitierehub-embed.js` |
| 2 | Temps chargement SDK | < 100ms | Performance API |
| 3 | Temps création iframe | < 50ms | Console.time |
| 4 | Temps premier rendu widget | < 2s | Lighthouse dans iframe |
| 5 | Temps auto-resize | < 100ms | postMessage timing |
| 6 | Impact sur page hôte | < 5ms blocking | Long Tasks API |
| 7 | Mémoire SDK | < 1MB | Chrome DevTools Memory |
| 8 | Requêtes réseau | 1 (iframe src) | DevTools Network |

---

## 8. Procédure de test complète

### Pré-requis

1. Coopérative avec `embed_configs` activé
2. Produits marketplace créés pour cette coopérative
3. Fiches techniques publiées
4. Au moins un membre avec carte active
5. Page HTML de test pour l'embed

### Page de test HTML

```html
<!DOCTYPE html>
<html>
<head>
  <title>Test Embed FaîtiereHub</title>
  <style>
    body { font-family: sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .widget-container { margin: 20px 0; border: 1px dashed #ccc; min-height: 200px; }
    h2 { color: #333; }
  </style>
</head>
<body>
  <h1>Test d'intégration FaîtiereHub</h1>

  <h2>1. Auto-init (data attributes)</h2>
  <div class="widget-container"
       data-faitierehub
       data-cooperative-id="VOTRE_COOPERATIVE_ID"
       data-widget="marketplace">
  </div>

  <h2>2. Vérification membre</h2>
  <div class="widget-container"
       data-faitierehub
       data-cooperative-id="VOTRE_COOPERATIVE_ID"
       data-widget="member_verify">
  </div>

  <h2>3. SDK programmatique</h2>
  <div id="sdk-widget" class="widget-container"></div>

  <h2>4. iFrame direct</h2>
  <iframe
    src="http://localhost:3000/embed/widget?cooperative_id=VOTRE_COOPERATIVE_ID&widget=dashboard"
    style="width:100%;min-height:300px;border:none;border-radius:8px;"
    loading="lazy"
    title="Dashboard"
  ></iframe>

  <script src="http://localhost:3000/embed/faitierehub-embed.js"></script>
  <script>
    // Test SDK programmatique
    var instance = FaitierehHub.init({
      cooperativeId: 'VOTRE_COOPERATIVE_ID',
      widget: 'fiches',
      container: '#sdk-widget',
      theme: { primaryColor: '#7c3aed', borderRadius: '12px' }
    });

    // Test destroy après 30s
    // setTimeout(function() { FaitierehHub.destroy(instance); }, 30000);
  </script>
</body>
</html>
```

### Étapes de validation

```
1. CONFIGURATION ADMIN
   □ Aller sur /dashboard/embed
   □ Activer l'embed
   □ Activer les 4 widgets
   □ Configurer la couleur primaire
   □ Ajouter l'origine de test (ex: http://localhost:8080)
   □ Sauvegarder

2. TEST SDK (page HTML)
   □ Ouvrir la page de test dans un navigateur
   □ Vérifier: 4 widgets s'affichent
   □ Vérifier: auto-init fonctionne (data attributes)
   □ Vérifier: SDK programmatique fonctionne
   □ Vérifier: iframe direct fonctionne
   □ Vérifier: theme custom appliqué (violet sur widget fiches)

3. TEST MEMBER VERIFY
   □ Dans le widget member_verify
   □ Entrer un numéro de carte valide
   □ Vérifier: info membre affichée en vert
   □ Entrer un numéro invalide
   □ Vérifier: message d'erreur en rouge

4. TEST RESPONSIVE
   □ Réduire la fenêtre à 320px
   □ Vérifier: widgets s'adaptent
   □ Vérifier: pas de scroll horizontal
   □ Vérifier: texte lisible

5. TEST SÉCURITÉ
   □ Ouvrir depuis un domaine non autorisé
   □ Vérifier: API retourne 403
   □ Ouvrir DevTools → Console
   □ Vérifier: pas d'erreurs JS
   □ Vérifier: pas de données sensibles exposées

6. TEST PERFORMANCE
   □ Ouvrir DevTools → Network
   □ Vérifier: SDK < 3KB
   □ Vérifier: 1 requête par widget (iframe src)
   □ Vérifier: temps de chargement < 2s
   □ Ouvrir DevTools → Performance
   □ Vérifier: pas de long tasks > 50ms
```

---

## 9. Matrice de compatibilité

| Plateforme | Méthode recommandée | Testé | Notes |
|-----------|-------------------|-------|-------|
| WordPress | Script + data attributes | □ | Ajouter dans un bloc HTML |
| Webflow | Embed code | □ | Section embed custom |
| Wix | HTML iframe | □ | Bloc HTML/iframe |
| Squarespace | Code injection | □ | Settings → Advanced → Code Injection |
| Shopify | Theme liquid | □ | Section custom |
| HTML statique | Script tag | □ | Le plus simple |
| React/Next.js | SDK programmatique | □ | useEffect + cleanup |
| Vue.js | SDK programmatique | □ | mounted + beforeUnmount |
| Angular | SDK programmatique | □ | ngOnInit + ngOnDestroy |

---

## 10. Checklist de validation finale

```
□ SDK JS se charge sans erreur
□ Auto-init fonctionne (data attributes)
□ Init programmatique fonctionne
□ Destroy supprime l'iframe
□ DestroyAll nettoie tout
□ Auto-resize fonctionne (hauteur dynamique)
□ Theme personnalisé appliqué
□ Widget marketplace affiche les produits
□ Widget member_verify fonctionne (valide + invalide)
□ Widget fiches affiche la liste
□ Widget dashboard affiche les stats
□ CORS headers corrects
□ Origin validation fonctionne
□ Rate limiting actif
□ Sandbox iframe sécurisé
□ Pas de fuite de données cross-tenant
□ Responsive sur mobile
□ Compatible Chrome/Firefox/Safari/Edge
□ Performance < 2s chargement
□ Pas d'erreurs console
□ Footer "Propulsé par FaîtiereHub" visible
```
