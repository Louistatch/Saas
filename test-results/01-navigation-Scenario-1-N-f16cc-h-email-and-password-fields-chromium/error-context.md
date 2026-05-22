# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: 01-navigation.spec.ts >> Scenario 1: Navigation & UX >> login page renders form with email and password fields
- Location: e2e\tests\01-navigation.spec.ts:47:7

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByLabel('Mot de passe')
Expected: visible
Error: strict mode violation: getByLabel('Mot de passe') resolved to 2 elements:
    1) <input value="" required="" id="password" type="password" data-slot="input" aria-invalid="false" placeholder="••••••••" autocomplete="current-password" class="file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:fon…/> aka getByRole('textbox', { name: 'Mot de passe' })
    2) <button type="button" aria-label="Afficher le mot de passe" class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground p-1">…</button> aka getByRole('button', { name: 'Afficher le mot de passe' })

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByLabel('Mot de passe')

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e2]:
    - generic [ref=e3]:
      - link "FaîtiereHub FaîtiereHub" [ref=e4] [cursor=pointer]:
        - /url: /
        - generic [ref=e5]:
          - img "FaîtiereHub" [ref=e6]
          - generic [ref=e7]: FaîtiereHub
      - generic [ref=e8]:
        - generic [ref=e9]:
          - heading "Connectez votre coopérative" [level=2] [ref=e10]
          - paragraph [ref=e11]: Gérez vos membres, les comptes d'exploitation et la croissance en un seul endroit.
        - list [ref=e12]:
          - listitem [ref=e13]:
            - generic [ref=e16]: Gérer les données des membres et les cartes numériques
          - listitem [ref=e17]:
            - generic [ref=e20]: Publier les comptes d'exploitation par région
          - listitem [ref=e21]:
            - generic [ref=e24]: Suivre les cotisations et l'engagement des membres
      - paragraph [ref=e25]: Au service des coopératives agricoles.
    - generic [ref=e27]:
      - generic [ref=e28]:
        - generic [ref=e29]: Bon retour
        - generic [ref=e30]: Connectez-vous à votre compte coopératif
      - generic [ref=e31]:
        - generic [ref=e32]:
          - generic [ref=e33]:
            - generic [ref=e34]: Adresse email
            - textbox "Adresse email" [ref=e35]:
              - /placeholder: you@example.com
          - generic [ref=e36]:
            - generic [ref=e37]:
              - generic [ref=e38]: Mot de passe
              - link "Mot de passe oublié ?" [ref=e39] [cursor=pointer]:
                - /url: /auth/forgot-password
            - generic [ref=e40]:
              - textbox "Mot de passe" [ref=e41]:
                - /placeholder: ••••••••
              - button "Afficher le mot de passe" [ref=e42]:
                - img [ref=e43]
          - button "Se connecter" [ref=e46]
        - paragraph [ref=e47]:
          - text: Vous n'avez pas de compte ?
          - link "S'inscrire" [ref=e48] [cursor=pointer]:
            - /url: /auth/signup
  - region "Notifications (F8)":
    - list
  - alert [ref=e49]
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
> 50  |     await expect(page.getByLabel('Mot de passe')).toBeVisible()
      |                                                   ^ Error: expect(locator).toBeVisible() failed
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
  115 |   })
  116 | })
  117 | 
```