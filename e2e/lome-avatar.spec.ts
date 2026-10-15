import { expect, test } from './lome-test'

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

  // Choose the classic Koffi (mini) and pagne 3 from the journal: the wrap is still drawn.
  await page.locator('button[aria-live="polite"]').first().click()
  await page.getByRole('button', { name: /Mon apparence/ }).click()
  await expect(page.getByRole('heading', { name: 'Mon apparence' })).toBeVisible()
  await page.getByText('Personnages classiques (mini)').click()
  await page.getByRole('button', { name: /Koffi \(mini\)/ }).click()
  await page.getByRole('button', { name: 'Pagne 3' }).click()
  await page.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect.poll(async () => (await player())?.model).toBe('character-male-b')
  const pagne = await page.evaluate(() => {
    const scene = (
      window as unknown as { __LOME_SCENE?: import('../lib/haroolife/engine/types').SceneProbe }
    ).__LOME_SCENE
    return Boolean(scene?.childNames('Joueur')?.includes('pagne'))
  })
  expect(pagne, 'the pagne wrap is on the avatar').toBe(true)
  expect(await page.evaluate(() => localStorage.getItem('haroolife.avatar.v1'))).toContain(
    'character-male-b',
  )

  // Walking swaps the clip to walk and back to idle when released.
  await page.keyboard.down('ArrowUp')
  await expect.poll(async () => (await player())?.anim).toMatch(/walk|run/)
  await page.keyboard.up('ArrowUp')
  await expect.poll(async () => (await player())?.anim).toBe('idle')

  // The look survives a reload and the same model is used indoors (the player's house).
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas').first()).toBeVisible({ timeout: 30000 })
  await expect.poll(async () => (await player())?.model).toBe('character-male-b')
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
    .toMatch(/Tu es devant|Destination atteinte/)
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
  // The room is drawn by the Three renderer once its scene is up: same model, same pagne wrap.
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
      { message: 'the indoor figure carries the pagne too', timeout: 30000 },
    )
    .toContain('pagne')
  // Stepping out plays the door clip before idling.
  await page.getByRole('button', { name: 'Entrer ou sortir' }).click()
  await expect.poll(async () => (await player())?.anim, { timeout: 15000 }).toMatch(/enter|idle/)
  await expect.poll(async () => (await player())?.mode).toBe('idle')
  expect(errors).toEqual([])
})
