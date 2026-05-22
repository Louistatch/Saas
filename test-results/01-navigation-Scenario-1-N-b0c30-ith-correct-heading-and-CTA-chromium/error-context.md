# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-navigation.spec.ts >> Scenario 1: Navigation & UX >> home page loads with correct heading and CTA
- Location: e2e\tests\01-navigation.spec.ts:5:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('link', { name: /Essai gratuit/i })
Expected: visible
Error: strict mode violation: getByRole('link', { name: /Essai gratuit/i }) resolved to 2 elements:
    1) <a href="/auth/signup">…</a> aka getByRole('link', { name: 'Essai gratuit', exact: true })
    2) <a href="/auth/signup" class="mt-8 inline-block">…</a> aka getByRole('link', { name: 'Commencer votre essai gratuit' })

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('link', { name: /Essai gratuit/i })

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
          - link "Produit" [ref=e10] [cursor=pointer]:
            - /url: /produit
          - link "Comptes d'exploitation" [ref=e11] [cursor=pointer]:
            - /url: /marketplace
          - link "Sécurité" [ref=e12] [cursor=pointer]:
            - /url: /securite
          - link "Entreprise" [ref=e13] [cursor=pointer]:
            - /url: /entreprise
          - link "À propos" [ref=e14] [cursor=pointer]:
            - /url: /a-propos
          - link "Contact" [ref=e15] [cursor=pointer]:
            - /url: /contact
        - generic [ref=e17]:
          - link "Se connecter" [ref=e18] [cursor=pointer]:
            - /url: /auth/login
            - button "Se connecter" [ref=e19]
          - link "Commencer" [ref=e20] [cursor=pointer]:
            - /url: /auth/signup
            - button "Commencer" [ref=e21]
    - main [ref=e22]:
      - generic [ref=e24]:
        - generic [ref=e25]:
          - generic [ref=e26]:
            - heading "Donnez du pouvoir à votre coopérative agricole" [level=1] [ref=e27]
            - paragraph [ref=e28]: Connectez vos membres, gérez les exploitations et grandissez ensemble grâce à notre plateforme numérique tout-en-un conçue pour les faîtières agricoles.
          - generic [ref=e29]:
            - link "Essai gratuit" [ref=e30] [cursor=pointer]:
              - /url: /auth/signup
              - button "Essai gratuit" [ref=e31]:
                - text: Essai gratuit
                - img
            - link "Voir les comptes d'exploitation" [ref=e32] [cursor=pointer]:
              - /url: /marketplace
              - button "Voir les comptes d'exploitation" [ref=e33]
          - generic [ref=e34]:
            - generic [ref=e37]: Essai gratuit de 30 jours
            - generic [ref=e40]: Sans carte bancaire
        - generic [ref=e41]:
          - generic [ref=e49]: faitierehub.com
          - img "Carte membre FaîtiereHub" [ref=e52]
      - generic [ref=e55]:
        - generic [ref=e56]:
          - heading "Carte membre premium" [level=2] [ref=e57]
          - paragraph [ref=e58]: Chaque membre reçoit une carte numérique avec QR code vérifiable, photo d'identité et toutes ses informations.
        - generic [ref=e60]:
          - img "Carte membre FaîtiereHub — Design premium avec photo, QR code, localité, coopérative" [ref=e61]
          - generic [ref=e63]: ✓ Vérifiable par QR
      - generic [ref=e65]:
        - generic [ref=e66]:
          - heading "Conçu pour les coopératives agricoles" [level=2] [ref=e67]
          - paragraph [ref=e68]: Tout ce dont vous avez besoin pour gérer vos membres, exploitations et croissance en un seul endroit
        - generic [ref=e69]:
          - generic [ref=e70]:
            - img [ref=e71]
            - heading "Gestion des membres" [level=3] [ref=e76]
            - paragraph [ref=e77]: Suivez et engagez les membres de la coopérative avec des cartes numériques et un contrôle d'accès
          - generic [ref=e78]:
            - img [ref=e79]
            - heading "Place de marché" [level=3] [ref=e82]
            - paragraph [ref=e83]: Connectez les membres aux exploitations et facilitez les transactions directes au sein de la coopérative
          - generic [ref=e84]:
            - img [ref=e85]
            - heading "Statistiques" [level=3] [ref=e87]
            - paragraph [ref=e88]: Obtenez des informations sur l'activité des membres, les ventes et les indicateurs de croissance en temps réel
          - generic [ref=e89]:
            - img [ref=e90]
            - heading "Intégration de données" [level=3] [ref=e92]
            - paragraph [ref=e93]: Synchronisez automatiquement les données des membres depuis KoboToolbox et d'autres sources
      - generic [ref=e95]:
        - heading "Comment fonctionne FaîtiereHub" [level=2] [ref=e96]
        - generic [ref=e97]:
          - generic [ref=e98]:
            - generic [ref=e99]: "1"
            - heading "Configurez votre coopérative" [level=3] [ref=e100]
            - paragraph [ref=e101]: Créez votre compte et configurez votre espace avec votre image de marque et vos paramètres
          - generic [ref=e103]:
            - generic [ref=e104]: "2"
            - heading "Ajoutez membres et données" [level=3] [ref=e105]
            - paragraph [ref=e106]: Importez les listes de membres et les données d'exploitation, puis émettez des cartes numériques avec codes QR
          - generic [ref=e108]:
            - generic [ref=e109]: "3"
            - heading "Activez les transactions" [level=3] [ref=e110]
            - paragraph [ref=e111]: Les membres consultent les comptes d'exploitation, accèdent aux fiches techniques et utilisent leurs cartes
      - generic [ref=e113]:
        - heading "Prêt à transformer votre coopérative ?" [level=2] [ref=e114]
        - paragraph [ref=e115]: Rejoignez les coopératives agricoles de la région qui utilisent FaîtiereHub pour connecter leurs membres et grandir ensemble.
        - link "Commencer votre essai gratuit" [ref=e116] [cursor=pointer]:
          - /url: /auth/signup
          - button "Commencer votre essai gratuit" [ref=e117]:
            - text: Commencer votre essai gratuit
            - img
    - contentinfo [ref=e118]:
      - generic [ref=e119]:
        - generic [ref=e120]:
          - generic [ref=e121]:
            - generic [ref=e122]:
              - img "FaîtiereHub" [ref=e123]
              - generic [ref=e124]: FaîtiereHub
            - paragraph [ref=e125]: La plateforme numérique au service des faîtières et coopératives agricoles africaines.
          - generic [ref=e126]:
            - heading "Produit" [level=4] [ref=e127]
            - list [ref=e128]:
              - listitem [ref=e129]:
                - link "Produit" [ref=e130] [cursor=pointer]:
                  - /url: /produit
              - listitem [ref=e131]:
                - link "Comptes d'exploitation" [ref=e132] [cursor=pointer]:
                  - /url: /marketplace
              - listitem [ref=e133]:
                - link "Sécurité" [ref=e134] [cursor=pointer]:
                  - /url: /securite
              - listitem [ref=e135]:
                - link "Blog" [ref=e136] [cursor=pointer]:
                  - /url: /blog
          - generic [ref=e137]:
            - heading "Entreprise" [level=4] [ref=e138]
            - list [ref=e139]:
              - listitem [ref=e140]:
                - link "À propos" [ref=e141] [cursor=pointer]:
                  - /url: /a-propos
              - listitem [ref=e142]:
                - link "Contact" [ref=e143] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e144]:
                - link "Entreprise" [ref=e145] [cursor=pointer]:
                  - /url: /entreprise
          - generic [ref=e146]:
            - heading "Légal" [level=4] [ref=e147]
            - list [ref=e148]:
              - listitem [ref=e149]:
                - link "Confidentialité" [ref=e150] [cursor=pointer]:
                  - /url: /legal/confidentialite
              - listitem [ref=e151]:
                - link "Conditions" [ref=e152] [cursor=pointer]:
                  - /url: /legal/conditions
              - listitem [ref=e153]:
                - link "Cookies" [ref=e154] [cursor=pointer]:
                  - /url: /legal/cookies
        - generic [ref=e155]:
          - paragraph [ref=e156]: © 2026 FaîtiereHub. Tous droits réservés.
          - paragraph [ref=e157]: Fait avec ♥ pour les coopératives agricoles
  - region "Notifications (F8)":
    - list
  - alert [ref=e158]
```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test'
  2   | import { ROUTES, PUBLIC_PAGES } from '../helpers/constants'
  3   | 
  4   | test.describe('Scenario 1: Navigation & UX', () => {
  5   |   test('home page loads with correct heading and CTA', async ({ page }) => {
  6   |     const response = await page.goto(ROUTES.home)
  7   |     expect(response?.status()).toBe(200)
  8   | 
  9   |     await expect(
  10  |       page.getByRole('heading', { name: /Donnez du pouvoir à votre coopérative agricole/i })
  11  |     ).toBeVisible()
  12  | 
  13  |     // CTA buttons
> 14  |     await expect(page.getByRole('link', { name: /Essai gratuit/i })).toBeVisible()
      |                                                                      ^ Error: expect(locator).toBeVisible() failed
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
  112 |         expect(bodyWidth, `${route} should not have horizontal scroll`).toBeLessThanOrEqual(viewportWidth + 5)
  113 |       }
  114 |     })
```