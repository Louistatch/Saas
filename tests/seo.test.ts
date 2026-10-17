import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sitemap from '../app/sitemap'
import { AgriculturalContext } from '../components/marketing/agricultural-context'
import { PUBLIC_PAGES, type PublicPagePath, SITE_ORIGIN, publicPageMetadata } from '../lib/seo'

test('sitemap entries are unique, absolute and agree with each page canonical', () => {
  const entries = sitemap()
  assert.equal(new Set(entries.map((entry) => entry.url)).size, entries.length)
  for (const entry of entries) {
    const url = new URL(entry.url)
    assert.equal(url.origin, SITE_ORIGIN)
    assert.equal(url.search, '')
    assert.equal(url.hash, '')
    const metadata = publicPageMetadata(url.pathname as PublicPagePath)
    assert.equal(metadata.alternates?.canonical, entry.url)
    assert.deepEqual(metadata.robots, { index: true, follow: true })
    assert.ok(metadata.description)
  }
  assert.equal(entries.length, Object.keys(PUBLIC_PAGES).length)
})

// Google's most-specific-match robots semantics, including * and the terminal $.
function crawlAllowed(robots: string, path: string) {
  const matches = robots
    .split('\n')
    .flatMap((line) => {
      const [, command, pattern] = line.match(/^(Allow|Disallow):\s*(\S+)/) ?? []
      if (!pattern) return []
      const regex = pattern.replace(/[.+?^{}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')
      return new RegExp(`^${regex}`).test(path)
        ? [{ allow: command === 'Allow', length: pattern.replace(/[\*$]/g, '').length }]
        : []
    })
    .sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow))
  return matches[0]?.allow ?? true
}

test('robots blocks private routes and facets, but permits public pages and render assets', async () => {
  const robots = await readFile('public/robots.txt', 'utf8')
  for (const path of [
    '/auth',
    '/auth/login',
    '/auth/signup/haroo?type=OUVRIER',
    '/admin',
    '/admin/users',
    '/dashboard',
    '/dashboard/members',
    '/operator/training',
    '/espace-operateur',
    '/mon-espace-haroo/profile',
    '/haroo',
    '/compte',
    '/messages',
    '/reports/attestation/123',
    '/verify/t/token',
    '/scan',
    '/api/verify/123',
    '/marketplace/achat/123',
    '/haroolife/territoire/lome',
    '/marketplace?culture=maïs',
    '/marche?type=job',
    '/fournisseurs',
    '/fournisseurs/123',
  ])
    assert.equal(crawlAllowed(robots, path), false, path)
  for (const path of [
    ...Object.keys(PUBLIC_PAGES),
    '/_next/static/app.js',
    '/_next/image?url=test&w=384&q=75',
    '/images/cards/haroo-ouvrier.webp',
    '/haroolife/vendor/quaternius/model.glb',
    '/haroolife/city/pack.glb',
    '/sitemap.xml',
    '/?utm_source=whatsapp',
  ])
    assert.equal(crawlAllowed(robots, path), true, path)
  assert.ok(robots.includes(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`))
})

test('home editorial is visible server HTML with 400+ words and h2/h3 hierarchy', () => {
  const html = renderToStaticMarkup(createElement(AgriculturalContext))
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  assert.ok(text.split(' ').filter(Boolean).length >= 400)
  assert.equal((html.match(/<h2\b/g) ?? []).length, 1)
  assert.equal((html.match(/<h3\b/g) ?? []).length, 4)
  assert.ok(!/<h1\b|<h4\b|hidden|display:\s*none/.test(html))
  for (const term of [
    'gestion coopérative agricole',
    'numérisation des filières agricoles',
    'FENOMAT',
    'carte membre agricole QR code',
    'canton',
    'préfecture',
  ])
    assert.ok(text.includes(term), term)
  assert.ok(html.includes('href="/marche"'))
  assert.ok(html.includes('href="/marketplace"'))
})
