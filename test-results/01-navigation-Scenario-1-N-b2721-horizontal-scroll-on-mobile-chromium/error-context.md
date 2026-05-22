# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-navigation.spec.ts >> Scenario 1: Navigation & UX >> Mobile viewport >> pages render without horizontal scroll on mobile
- Location: e2e\tests\01-navigation.spec.ts:103:9

# Error details

```
Error: / should not have horizontal scroll

expect(received).toBeLessThanOrEqual(expected)

Expected: <= 380
Received:    402
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - navigation [ref=e4]:
        - link "FaîtiereHub FaîtiereHub" [ref=e5] [cursor=pointer]:
          - /url: /
          - generic [ref=e6]:
            - img "FaîtiereHub" [ref=e7]
            - generic [ref=e8]: FaîtiereHub
        - generic [ref=e9]:
          - generic [ref=e10]:
            - link "Se connecter" [ref=e11] [cursor=pointer]:
              - /url: /auth/login
              - button "Se connecter" [ref=e12]
            - link "Commencer" [ref=e13] [cursor=pointer]:
              - /url: /auth/signup
              - button "Commencer" [ref=e14]
          - button "Ouvrir le menu" [ref=e15]:
            - img [ref=e16]
    - main [ref=e17]:
      - generic [ref=e19]:
        - generic [ref=e20]:
          - generic [ref=e21]:
            - heading "Donnez du pouvoir à votre coopérative agricole" [level=1] [ref=e22]
            - paragraph [ref=e23]: Connectez vos membres, gérez les exploitations et grandissez ensemble grâce à notre plateforme numérique tout-en-un conçue pour les faîtières agricoles.
          - generic [ref=e24]:
            - link "Essai gratuit" [ref=e25] [cursor=pointer]:
              - /url: /auth/signup
              - button "Essai gratuit" [ref=e26]:
                - text: Essai gratuit
                - img
            - link "Voir les comptes d'exploitation" [ref=e27] [cursor=pointer]:
              - /url: /marketplace
              - button "Voir les comptes d'exploitation" [ref=e28]
          - generic [ref=e29]:
            - generic [ref=e32]: Essai gratuit de 30 jours
            - generic [ref=e35]: Sans carte bancaire
        - generic [ref=e36]:
          - generic [ref=e44]: faitierehub.com
          - img "Carte membre FaîtiereHub" [ref=e47]
      - generic [ref=e50]:
        - generic [ref=e51]:
          - heading "Carte membre premium" [level=2] [ref=e52]
          - paragraph [ref=e53]: Chaque membre reçoit une carte numérique avec QR code vérifiable, photo d'identité et toutes ses informations.
        - generic [ref=e55]:
          - img "Carte membre FaîtiereHub — Design premium avec photo, QR code, localité, coopérative" [ref=e56]
          - generic [ref=e58]: ✓ Vérifiable par QR
      - generic [ref=e60]:
        - generic [ref=e61]:
          - heading "Conçu pour les coopératives agricoles" [level=2] [ref=e62]
          - paragraph [ref=e63]: Tout ce dont vous avez besoin pour gérer vos membres, exploitations et croissance en un seul endroit
        - generic [ref=e64]:
          - generic [ref=e65]:
            - img [ref=e66]
            - heading "Gestion des membres" [level=3] [ref=e71]
            - paragraph [ref=e72]: Suivez et engagez les membres de la coopérative avec des cartes numériques et un contrôle d'accès
          - generic [ref=e73]:
            - img [ref=e74]
            - heading "Place de marché" [level=3] [ref=e77]
            - paragraph [ref=e78]: Connectez les membres aux exploitations et facilitez les transactions directes au sein de la coopérative
          - generic [ref=e79]:
            - img [ref=e80]
            - heading "Statistiques" [level=3] [ref=e82]
            - paragraph [ref=e83]: Obtenez des informations sur l'activité des membres, les ventes et les indicateurs de croissance en temps réel
          - generic [ref=e84]:
            - img [ref=e85]
            - heading "Intégration de données" [level=3] [ref=e87]
            - paragraph [ref=e88]: Synchronisez automatiquement les données des membres depuis KoboToolbox et d'autres sources
      - generic [ref=e90]:
        - heading "Comment fonctionne FaîtiereHub" [level=2] [ref=e91]
        - generic [ref=e92]:
          - generic [ref=e93]:
            - generic [ref=e94]: "1"
            - heading "Configurez votre coopérative" [level=3] [ref=e95]
            - paragraph [ref=e96]: Créez votre compte et configurez votre espace avec votre image de marque et vos paramètres
          - generic [ref=e97]:
            - generic [ref=e98]: "2"
            - heading "Ajoutez membres et données" [level=3] [ref=e99]
            - paragraph [ref=e100]: Importez les listes de membres et les données d'exploitation, puis émettez des cartes numériques avec codes QR
          - generic [ref=e101]:
            - generic [ref=e102]: "3"
            - heading "Activez les transactions" [level=3] [ref=e103]
            - paragraph [ref=e104]: Les membres consultent les comptes d'exploitation, accèdent aux fiches techniques et utilisent leurs cartes
      - generic [ref=e106]:
        - heading "Prêt à transformer votre coopérative ?" [level=2] [ref=e107]
        - paragraph [ref=e108]: Rejoignez les coopératives agricoles de la région qui utilisent FaîtiereHub pour connecter leurs membres et grandir ensemble.
        - link "Commencer votre essai gratuit" [ref=e109] [cursor=pointer]:
          - /url: /auth/signup
          - button "Commencer votre essai gratuit" [ref=e110]:
            - text: Commencer votre essai gratuit
            - img
    - contentinfo [ref=e111]:
      - generic [ref=e112]:
        - generic [ref=e113]:
          - generic [ref=e114]:
            - generic [ref=e115]:
              - img "FaîtiereHub" [ref=e116]
              - generic [ref=e117]: FaîtiereHub
            - paragraph [ref=e118]: La plateforme numérique au service des faîtières et coopératives agricoles africaines.
          - generic [ref=e119]:
            - heading "Produit" [level=4] [ref=e120]
            - list [ref=e121]:
              - listitem [ref=e122]:
                - link "Produit" [ref=e123] [cursor=pointer]:
                  - /url: /produit
              - listitem [ref=e124]:
                - link "Comptes d'exploitation" [ref=e125] [cursor=pointer]:
                  - /url: /marketplace
              - listitem [ref=e126]:
                - link "Sécurité" [ref=e127] [cursor=pointer]:
                  - /url: /securite
              - listitem [ref=e128]:
                - link "Blog" [ref=e129] [cursor=pointer]:
                  - /url: /blog
          - generic [ref=e130]:
            - heading "Entreprise" [level=4] [ref=e131]
            - list [ref=e132]:
              - listitem [ref=e133]:
                - link "À propos" [ref=e134] [cursor=pointer]:
                  - /url: /a-propos
              - listitem [ref=e135]:
                - link "Contact" [ref=e136] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e137]:
                - link "Entreprise" [ref=e138] [cursor=pointer]:
                  - /url: /entreprise
          - generic [ref=e139]:
            - heading "Légal" [level=4] [ref=e140]
            - list [ref=e141]:
              - listitem [ref=e142]:
                - link "Confidentialité" [ref=e143] [cursor=pointer]:
                  - /url: /legal/confidentialite
              - listitem [ref=e144]:
                - link "Conditions" [ref=e145] [cursor=pointer]:
                  - /url: /legal/conditions
              - listitem [ref=e146]:
                - link "Cookies" [ref=e147] [cursor=pointer]:
                  - /url: /legal/cookies
        - generic [ref=e148]:
          - paragraph [ref=e149]: © 2026 FaîtiereHub. Tous droits réservés.
          - paragraph [ref=e150]: Fait avec ♥ pour les coopératives agricoles
  - region "Notifications (F8)":
    - list
  - alert [ref=e151]
```

# Test source

```ts
  12  | 
  13  |     // CTA buttons
  14  |     await expect(page.getByRole('link', { name: /Essai gratuit/i })).toBeVisible()
  15  |     await expect(page.getByRole('link', { name: /Voir les comptes/i })).toBeVisible()
  16  |   })
  17  | 
  18  |   test('all public pages return 200 and render without errors', async ({ page }) => {
  19  |     const publicRoutes = [
  20  |       ROUTES.home,
  21  |       ROUTES.about,
  22  |       ROUTES.contact,
  23  |       ROUTES.blog,
  24  |       ROUTES.marketplace,
  25  |       ROUTES.login,
  26  |     ]
  27  | 
  28  |     for (const route of publicRoutes) {
  29  |       const response = await page.goto(route)
  30  |       expect(response?.status(), `${route} should return 200`).toBe(200)
  31  | 
  32  |       // Check no uncaught JS errors
  33  |       const errors: string[] = []
  34  |       page.on('pageerror', (err) => errors.push(err.message))
  35  |       await page.waitForLoadState('domcontentloaded')
  36  |       expect(errors, `${route} should have no JS errors`).toHaveLength(0)
  37  |     }
  38  |   })
  39  | 
  40  |   test('marketplace page loads with correct heading', async ({ page }) => {
  41  |     await page.goto(ROUTES.marketplace)
  42  |     await expect(
  43  |       page.getByRole('heading', { name: /Comptes d'exploitation agricole/i })
  44  |     ).toBeVisible()
  45  |   })
  46  | 
  47  |   test('login page renders form with email and password fields', async ({ page }) => {
  48  |     await page.goto(ROUTES.login)
  49  |     await expect(page.getByLabel('Adresse email')).toBeVisible()
  50  |     await expect(page.getByLabel('Mot de passe')).toBeVisible()
  51  |     await expect(page.getByRole('button', { name: 'Se connecter' })).toBeVisible()
  52  |   })
  53  | 
  54  |   test('Logo links back to home page', async ({ page }) => {
  55  |     await page.goto(ROUTES.marketplace)
  56  |     // Click the logo/brand link
  57  |     const logoLink = page.locator('a[href="/"]').first()
  58  |     await logoLink.click()
  59  |     await expect(page).toHaveURL(/\/$/)
  60  |   })
  61  | 
  62  |   test('navigation links route to correct pages', async ({ page }) => {
  63  |     await page.goto(ROUTES.home)
  64  | 
  65  |     // Test nav links in header/footer
  66  |     const navLinks = [
  67  |       { name: /À propos/i, path: '/a-propos' },
  68  |       { name: /Contact/i, path: '/contact' },
  69  |     ]
  70  | 
  71  |     for (const link of navLinks) {
  72  |       await page.goto(ROUTES.home)
  73  |       const navLink = page.getByRole('link', { name: link.name }).first()
  74  |       if (await navLink.isVisible()) {
  75  |         await navLink.click()
  76  |         await expect(page).toHaveURL(new RegExp(link.path))
  77  |       }
  78  |     }
  79  |   })
  80  | 
  81  |   test.describe('Mobile viewport', () => {
  82  |     test.use({ viewport: { width: 375, height: 667 } })
  83  | 
  84  |     test('mobile menu toggle works', async ({ page }) => {
  85  |       await page.goto(ROUTES.home)
  86  | 
  87  |       // On mobile, the desktop nav should be hidden
  88  |       const desktopNav = page.locator('nav.hidden.md\\:flex, .hidden.md\\:flex')
  89  | 
  90  |       // Look for a hamburger/menu button
  91  |       const menuButton = page.getByRole('button', { name: /menu/i }).or(
  92  |         page.locator('button[aria-label*="menu" i], button[aria-label*="Menu" i]')
  93  |       )
  94  | 
  95  |       // If there's a mobile menu button, test it
  96  |       if (await menuButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
  97  |         await menuButton.first().click()
  98  |         // After clicking, navigation links should become visible
  99  |         await expect(page.getByRole('link', { name: /À propos/i })).toBeVisible({ timeout: 5000 })
  100 |       }
  101 |     })
  102 | 
  103 |     test('pages render without horizontal scroll on mobile', async ({ page }) => {
  104 |       const routes = [ROUTES.home, ROUTES.marketplace, ROUTES.login]
  105 | 
  106 |       for (const route of routes) {
  107 |         await page.goto(route)
  108 |         await page.waitForLoadState('domcontentloaded')
  109 | 
  110 |         const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
  111 |         const viewportWidth = await page.evaluate(() => window.innerWidth)
> 112 |         expect(bodyWidth, `${route} should not have horizontal scroll`).toBeLessThanOrEqual(viewportWidth + 5)
      |                                                                         ^ Error: / should not have horizontal scroll
  113 |       }
  114 |     })
  115 |   })
  116 | })
  117 | 
```