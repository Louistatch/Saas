import { expect, test } from './lome-test'

/**
 * « Photo » in the phone: a picture of the 3D scene as it is on screen (not an empty frame),
 * with the band naming the place, ready to be shared on WhatsApp or saved.
 */
test('photo of the game, ready to share on WhatsApp', async ({ page }, info) => {
  test.setTimeout(120_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
  await page.waitForTimeout(1500)
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Photo$/ }).click()
  const preview = page.getByTestId('photo-preview')
  await expect(preview).toBeVisible({ timeout: 20000 })
  // The picture holds the scene: many distinct colours, not a blank or black frame.
  const colours = await preview.evaluate(async (img: HTMLImageElement) => {
    await img.decode()
    const c = document.createElement('canvas')
    c.width = 64
    c.height = 64
    const g = c.getContext('2d')
    if (!g) return 0
    g.drawImage(img, 0, 0, 64, 64)
    const d = g.getImageData(0, 0, 64, 52).data // above the band
    const seen = new Set<number>()
    for (let i = 0; i < d.length; i += 4)
      seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4))
    return seen.size
  })
  expect(colours).toBeGreaterThan(20)
  await expect(page.getByRole('button', { name: 'Partager sur WhatsApp' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Enregistrer la photo' })).toBeVisible()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Enregistrer la photo' }).click()
  expect((await download).suggestedFilename()).toBe('haroolife.png')
  await page.screenshot({ path: info.outputPath('photo.png') })
  expect(errors).toEqual([])
})
