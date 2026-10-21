import type { Route } from '@playwright/test'
import { expect, test } from './lome-test'

/**
 * Everyone in HarooLife: the presence chip shows how many people are online in the whole game,
 * the « Joueurs en ligne » panel lists the residents (online first) and « Écrire » opens a private
 * conversation with someone who is not connected. The database functions are answered here
 * (rules: tests/haroolife-players.test.mjs); the live relay is cut so the conversation goes
 * through the database and /messages, as it does when the relay is unreachable.
 */
const AMA = 'a1b2c3d4e5f60718'
const EDEM = '0f1e2d3c4b5a6978'
const ROOM = `dm:${EDEM}:ffffffffffffffff`

const json = (route: Route, body: unknown) =>
  route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

test('players online in the whole game, the list of residents, writing to someone away', async ({
  page,
}, info) => {
  test.setTimeout(150_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.routeWebSocket(/socket\.io/, (ws) => ws.close())
  const searched: unknown[] = []
  let opened: unknown = null
  const list = [
    {
      key: AMA,
      name: 'Ama',
      username: 'ama_be',
      pagne: 3,
      online: true,
      locality: 'kara',
      seen: 'now',
    },
    {
      key: EDEM,
      name: 'Edem',
      username: null,
      pagne: 4,
      online: false,
      locality: null,
      seen: 'today',
    },
  ]
  await page.route('**/rest/v1/rpc/haroolife_here', (route) =>
    json(route, { online: 12, players: 340 }),
  )
  await page.route('**/rest/v1/rpc/haroolife_players', (route) => {
    const body = route.request().postDataJSON() as { p_search: string | null }
    searched.push(body.p_search)
    const q = (body.p_search ?? '').toLowerCase()
    return json(route, {
      online: 12,
      players: 340,
      list: list.filter((p) => !q || p.name.toLowerCase().includes(q)),
    })
  })
  await page.route('**/rest/v1/rpc/haroolife_dm_open', (route) => {
    opened = route.request().postDataJSON()
    return json(route, { room: ROOM, peer: { key: EDEM, name: 'Edem', pagne: 4 } })
  })

  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  const chip = page.getByRole('button', { name: 'Voir les joueurs en ligne' })
  await expect(chip).toContainText('12')
  await chip.click()

  const all = page.getByTestId('players-directory')
  await expect(all.getByTestId('players-online')).toHaveText('12 personnes en ligne')
  await expect(all).toContainText('Dans tout HarooLife, visiteurs compris · 340 habitants')
  const rows = all.getByTestId('player-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Ama@ama_be')
  await expect(rows.nth(0)).toContainText('En ligne à Kara')
  await expect(rows.nth(1)).toContainText('Edem')
  await expect(rows.nth(1)).toContainText('Passé aujourd’hui')
  await page.screenshot({ path: info.outputPath('players-list.png'), animations: 'disabled' })

  await all.getByRole('searchbox', { name: 'Chercher un joueur' }).fill('ed')
  await expect(rows).toHaveCount(1)
  expect(searched).toContain('ed')

  // Edem is not connected: the conversation opens anyway, on /messages.
  const nav = page.waitForRequest(
    (r) =>
      r.isNavigationRequest() && r.url().includes(`/messages?room=${encodeURIComponent(ROOM)}`),
  )
  await rows.first().getByRole('button', { name: 'Écrire' }).click()
  await nav
  expect(opened).toEqual({ p_key: EDEM })
  expect(errors).toEqual([])
})
