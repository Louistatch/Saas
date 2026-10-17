import { expect, test } from '@playwright/test'
import { PUBLIC_PAGES, SITE_ORIGIN } from '../lib/seo'

test('public URLs return one self-canonical and indexable server HTML; sitemap agrees', async ({
  request,
}) => {
  const sitemap = await request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  expect(sitemap.headers()['content-type']).toContain('xml')
  const xml = await sitemap.text()
  for (const path of Object.keys(PUBLIC_PAGES)) {
    const response = await request.get(path, { headers: { 'user-agent': 'Googlebot' } })
    expect(response.status(), path).toBe(200)
    const html = await response.text()
    const canonical = html.match(/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/g) ?? []
    expect(canonical, path).toHaveLength(1)
    const url = new URL(path, SITE_ORIGIN).href
    expect(new URL(canonical[0]?.match(/href="([^"]+)"/)?.[1] ?? '').href, path).toBe(url)
    expect(xml).toContain(`<loc>${url}</loc>`)
    expect(html, path).toMatch(/<meta name="robots" content="index, follow"/)
    expect(html, path).not.toMatch(/<meta name="robots" content="noindex/)
  }
  for (const path of ['/marche?type=job', '/marketplace?culture=Mais&region=Kara']) {
    const html = await (await request.get(path)).text()
    expect(html).toContain(`href="${SITE_ORIGIN}${path.split('?')[0]}"`)
    // A crawler without JS sees an actual heading and introduction, even if filters suspend.
    expect(html).toMatch(/<h1\b/)
  }
  expect(xml).not.toMatch(/auth|dashboard|verify|achat|territoire/)
})

test('private redirects and API responses carry noindex; public layouts do not leak index permissions', async ({
  request,
}) => {
  for (const path of [
    '/auth/login',
    '/auth/signup/haroo',
    '/dashboard',
    '/admin',
    '/operator',
    '/haroo',
    '/compte',
    '/messages',
    '/verify/TEST-123',
    '/api/seo-not-found',
    '/marketplace/achat/unknown',
    '/haroolife/territoire/lome',
  ]) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.headers()['x-robots-tag'], path).toContain('noindex')
  }
  const unknown = await request.get('/blog')
  expect(await unknown.text()).toMatch(/<meta name="robots" content="noindex, follow"/)
  const root = await request.get('/', { headers: { Host: 'faitierehub.com' }, maxRedirects: 0 })
  expect(root.status()).toBe(200) // No hard-coded apex -> www redirect remains.
})

test('mobile home uses responsive WebP specimens and remains usable without a card-rendering API', async ({
  page,
  request,
}, testInfo) => {
  const previewRequests: string[] = []
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('request', (r) => {
    if (r.url().includes('/api/haroo/card/preview')) previewRequests.push(r.url())
  })
  await page.goto('/')
  const hero = page.getByAltText(/Agricultrice consultant/)
  expect(await hero.getAttribute('loading')).not.toBe('lazy')
  await page
    .getByAltText('Spécimen de carte professionnelle Ouvrier agricole')
    .scrollIntoViewIfNeeded()
  const specimens = page.getByAltText(/^Spécimen de carte professionnelle/)
  await expect(specimens).toHaveCount(3)
  for (const image of await specimens.all()) {
    expect(await image.getAttribute('loading')).toBe('lazy')
    expect(await image.getAttribute('sizes')).toContain('100vw')
    await image.scrollIntoViewIfNeeded()
    await expect
      .poll(() => image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
      .toBe(true)
  }
  const currentSrc = await specimens.first().evaluate((img: HTMLImageElement) => img.currentSrc)
  const response = await request.get(currentSrc, { headers: { accept: 'image/webp' } })
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toBe('image/webp')
  expect((await response.body()).length).toBeLessThan(70_000)
  expect(previewRequests).toEqual([])
  expect(errors).toEqual([])
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page
    .getByRole('heading', { name: /La gestion coopérative agricole au Togo/ })
    .scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('accueil-semantique-mobile.png') })
  await page.getByRole('heading', { name: 'Carte membre premium' }).scrollIntoViewIfNeeded()
  await page.screenshot({ path: testInfo.outputPath('carte-premium-mobile.png') })
})

test('market introductions and canonical tags are visible with JavaScript disabled', async ({
  browser,
}) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  })
  try {
    const page = await context.newPage()
    for (const [path, heading] of [
      ['/marche', 'Marché agricole de proximité au Togo'],
      ['/marketplace', 'Comptes d’exploitation et produits agricoles'],
    ]) {
      await page.goto(`http://127.0.0.1:3211${path}`)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
        'href',
        `${SITE_ORIGIN}${path}`,
      )
    }
  } finally {
    await context.close()
  }
})
