import { initialCityLife } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { expect, openPlaces, test } from './lome-test'

/**
 * Jalon D2: the player's look (model and pagne) is chosen in the world, persists on the
 * device, and the very same character walks the street, enters a room and drives.
 */
type Player = { model: string; anim: string; mode: string; driving: boolean }

test('one configurable avatar across street, room and taxi', async ({ page }, testInfo) => {
  test.setTimeout(240_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const player = () =>
    page.evaluate(() => (window as unknown as { __LOME_PLAYER?: Player }).__LOME_PLAYER ?? null)
  // New game on this device: the appearance sheet opens first, with the adult characters and
  // an animated preview; « Commencer » keeps the choice and never touches the save.
  await page.addInitScript(() => localStorage.removeItem('haroolife.avatar.chosen'))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('heading', { name: 'Mon apparence' })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('img', { name: 'Aperçu animé du personnage' })).toBeVisible()
  await page.getByRole('button', { name: /^Kossi Chemise/ }).click()
  await page.getByRole('button', { name: 'Commencer' }).click()
  await expect(page.getByRole('heading', { name: 'Mon apparence' })).toBeHidden()
  await expect.poll(async () => (await player())?.model).toBe('kossi')
  expect(await page.evaluate(() => localStorage.getItem('haroolife.avatar.chosen'))).toBe('1')
  await page.screenshot({ path: testInfo.outputPath('avatar-adult-street.png') })

  // Choose a dressed adult and pagne 3; classic mini characters are no longer offered.
  await page.locator('button[aria-live="polite"]').first().click()
  await page.getByRole('button', { name: /Mon apparence/ }).click()
  await expect(page.getByRole('heading', { name: 'Mon apparence' })).toBeVisible()
  await expect(page.getByText('Personnages classiques (mini)')).toHaveCount(0)
  await page.getByRole('button', { name: /^Koffi Sweat/ }).click()
  await page.getByRole('button', { name: 'Pagne 3' }).click()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect.poll(async () => (await player())?.model).toBe('koffi')
  const pagne = await page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return Boolean(scene?.childNames('Joueur')?.includes('pagne'))
  })
  expect(pagne, 'the old box wrap is gone; pagne recolours the imported garment').toBe(false)
  expect(await page.evaluate(() => localStorage.getItem('haroolife.avatar.v1'))).toContain('koffi')

  // Walking swaps the clip to walk and back to idle when released.
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => (await player())?.anim).toMatch(/walk|run/)
  await page.keyboard.up('ArrowUp')
  await expect.poll(async () => (await player())?.anim).toBe('idle')

  // The look survives a reload and the same model is used indoors (the player's house).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await player())?.model).toBe('koffi')
  await page.getByRole('button', { name: 'Maison', exact: true }).click()
  await page.getByRole('button', { name: 'Rentrer chez moi' }).click()
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_CITY?: { route: number; lastEvent: string } })
              .__LOME_CITY?.lastEvent ?? '',
        ),
      { timeout: 60000 },
    )
    .toMatch(/Tu es (arrivé )?devant|Destination atteinte/)
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  // Indoors the city rig is replaced by the room scene: the game state tells where we are.
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (window as unknown as { __LOME_CITY?: { inside: unknown } }).__LOME_CITY?.inside ??
            null,
        ),
      { timeout: 60000 },
    )
    .not.toBeNull()
  // The room is drawn by the Three renderer once its scene is up: same adult model and coloured garment.
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const scene = (
            window as unknown as {
              __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe
            }
          ).__LOME_SCENE
          return scene?.childNames('Joueur')?.join(',') ?? null
        }),
      { message: 'the indoor figure is the same skinned adult', timeout: 30000 },
    )
    .toContain('figure')
  // Stepping out plays the door clip before idling.
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(async () => (await player())?.anim, { timeout: 15000 }).toMatch(/enter|idle/)
  await expect.poll(async () => (await player())?.mode).toBe('idle')
  expect(errors).toEqual([])
})

for (const engine of ['haroo', 'three'])
  test(`${engine}: classic save migrates to a human model without loading any cubic asset`, async ({
    page,
  }, info) => {
    const errors: string[] = [],
      oldAssets: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route(/\/(mini-characters|characters)\/character-/, (route) => {
      oldAssets.push(route.request().url())
      return route.abort()
    })
    const state = initialCityLife()
    state.life.wallet = 5432
    // Every interior is drawn by the HarooLife engine, a remembered ?engine=three included
    // (engine/select.ts rendererForInterior): the migration must hold under both choices.
    const gym = landmarks().find((l) => l.type === 'sport')
    if (!gym) throw new Error('no gym in Lomé')
    state.insideLot = gym.id
    state.at = gym.door
    state.target = gym.id
    await page.addInitScript(
      ({ state }) => {
        if (sessionStorage.getItem('adult-migration-seeded')) return
        sessionStorage.setItem('adult-migration-seeded', '1')
        localStorage.setItem(
          'haroolife.avatar.v1',
          JSON.stringify({ v: 1, model: 'character-male-b', pagne: 3, classic: true }),
        )
        localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(state))
      },
      { state },
    )
    await page.goto(`/haroolife?engine=${engine}`)
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __LOME_SCENE?: { engine: string } }).__LOME_SCENE?.engine,
          ),
        { timeout: 45000 },
      )
      .toBe('haroo')
    await expect
      .poll(() =>
        page.evaluate(() => JSON.parse(localStorage.getItem('haroolife.avatar.v1') ?? '{}').model),
      )
      .toBe('koffi')
    const saved = await page.evaluate(() => ({
      avatar: JSON.parse(localStorage.getItem('haroolife.avatar.v1') ?? '{}'),
      city: JSON.parse(localStorage.getItem('haroolife.lome-city.v1') ?? '{}'),
    }))
    expect(saved.avatar).toEqual({ v: 1, model: 'koffi', pagne: 3 })
    expect(saved.city.life.wallet).toBe(5432)
    await page.screenshot({ path: info.outputPath(`adult-${engine}-interior.png`) })
    await page.reload()
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __LOME_SCENE?: { engine: string } }).__LOME_SCENE?.engine,
          ),
        { timeout: 45000 },
      )
      .toBe('haroo')
    expect(oldAssets).toEqual([])
    expect(errors).toEqual([])
  })

for (const transport of ['moto', 'taxi'])
  test(`${transport}: the trip uses an adult skeletal avatar and an actual 3D vehicle`, async ({
    page,
  }, info) => {
    const errors: string[] = [],
      oldAssets: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    await page.route(/\/(mini-characters|characters)\/character-/, (route) => {
      oldAssets.push(route.request().url())
      return route.abort()
    })
    await page.addInitScript(() =>
      localStorage.setItem(
        'haroolife.avatar.v1',
        JSON.stringify({ v: 1, model: 'kossi', pagne: 3 }),
      ),
    )
    await page.goto('/haroolife')
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __LOME_PLAYER?: { model: string } }).__LOME_PLAYER?.model,
          ),
        { timeout: 45000 },
      )
      .toBe('kossi')
    await openPlaces(page)
    await page
      .getByRole('group', { name: 'Filtrer la ville' })
      .getByRole('button', { name: 'Loisirs' })
      .click()
    await page.getByRole('button', { name: /Salle Fitness Tokoin/ }).click()
    const sheet = page.getByRole('dialog', { name: 'Lieu' })
    await sheet.getByRole('button', { name: transport === 'moto' ? /Zémidjan/ : /Taxi/ }).click()
    await sheet.getByRole('button', { name: 'Confirmer le trajet' }).click()
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (
                window as unknown as {
                  __LOME_RIDE?: {
                    avatar?: { skinnedMeshes: number }
                    model: string
                    clip: string
                    source: string
                    moto: boolean
                    wheels: number
                  }
                }
              ).__LOME_RIDE?.avatar?.skinnedMeshes,
          ),
        { timeout: 20000, intervals: [100, 200, 300] },
      )
      .toBeGreaterThan(0)
    const ride = await page.evaluate(
      () =>
        (
          window as unknown as {
            __LOME_RIDE?: {
              avatar?: { skinnedMeshes: number }
              model: string
              clip: string
              source: string
              moto: boolean
              wheels: number
            }
          }
        ).__LOME_RIDE,
    )
    expect(ride?.model).toBe('kossi')
    expect(ride?.clip).toBe('HarooDrive')
    expect(ride?.source).toContain('/quaternius/')
    if (transport === 'moto') {
      expect(ride?.moto).toBe(true)
      expect(ride?.wheels).toBe(2)
    }
    await expect(page.getByTestId('joystick')).toBeHidden()
    await expect(page.getByRole('button', { name: 'Entrer ou sortir' })).toBeHidden()
    const bounds = await page.evaluate(
      () =>
        (
          window as unknown as {
            __LOME_RIDE?: {
              vehicleScreen?: { x: number; y: number; width: number; height: number }
            }
          }
        ).__LOME_RIDE?.vehicleScreen,
    )
    expect(bounds).toBeTruthy()
    expect(bounds!.x).toBeGreaterThan(5)
    expect(bounds!.x + bounds!.width).toBeLessThan(page.viewportSize()!.width - 5)
    expect(bounds!.y).toBeGreaterThan(190)
    expect(bounds!.y + bounds!.height).toBeLessThan(page.viewportSize()!.height - 100)
    await page.screenshot({ path: info.outputPath(`adult-${transport}-trip.png`) })
    await expect
      .poll(
        () =>
          page.evaluate(
            () => (window as unknown as { __LOME_CITY?: { route: number } }).__LOME_CITY?.route,
          ),
        { timeout: 20000 },
      )
      .toBe(0)
    expect(oldAssets).toEqual([])
    expect(errors).toEqual([])
  })
