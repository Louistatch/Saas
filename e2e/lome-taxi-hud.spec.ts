import { expect, test } from './lome-test'

/**
 * At the wheel on a taxi shift the street stays visible: one line for the fare, no build or
 * objectives buttons, no message strip. Each fare paid rises as a bubble under the balance with
 * its breakdown (the fare, the fuel and maintenance taken) just after the money moved.
 */
type Service = { phase: string; completed: number; fare: { price: number } | null }
type Receipt = { gross: number; fuel: number; maintenance: number; net: number }

test('taxi shift: a one-line fare and a payment bubble after each fare', async ({ page }, info) => {
  test.setTimeout(200_000)
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const fare = () =>
    page.evaluate(
      () =>
        (
          window as unknown as {
            __LOME_FARE?: { service: Service; care?: { lastReceipt?: Receipt } }
          }
        ).__LOME_FARE ?? null,
    )
  await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
  await page
    .getByRole('navigation', { name: 'Navigation du jeu' })
    .getByRole('button', { name: 'Téléphone' })
    .click()
  await page.getByRole('button', { name: /Métiers/ }).click()
  await page.getByTestId('duty-taxi').click()
  const board = page.getByRole('button', { name: 'Monter dans le taxi', exact: true })
  await expect(board).toBeVisible({ timeout: 45000 })
  const dimensions = await page.evaluate(
    () =>
      (
        window as unknown as {
          __LOME_PLAYER?: { vehicleSize?: { x: number; y: number; z: number } }
        }
      ).__LOME_PLAYER?.vehicleSize,
  )
  expect(dimensions, 'a real fitted taxi has loaded').toBeTruthy()
  expect(Math.max(dimensions!.x, dimensions!.z), 'taxi is at the traffic scale').toBeLessThan(2.3)
  expect(dimensions!.y).toBeLessThan(0.8)
  if (info.project.name.startsWith('mobile')) await board.tap()
  else await board.click()

  await expect.poll(async () => (await fare())?.service.phase, { timeout: 60000 }).toBe('trip')
  const status = page.getByTestId('service-status')
  await expect(status.getByTestId('fare-banner')).toBeVisible()
  expect((await status.boundingBox())?.height ?? 99).toBeLessThan(40)
  await expect(page.getByRole('button', { name: 'Ouvrir les outils de construction' })).toHaveCount(
    0,
  )
  await expect(page.getByRole('button', { name: 'Ouvrir les objectifs' })).toHaveCount(0)
  await page.screenshot({ path: info.outputPath('taxi-trip.png') })
  // The details are one tap away.
  await status.click()
  await expect(page.getByTestId('service-details')).toContainText('course(s)')
  await status.click()
  await expect(page.getByTestId('service-details')).toHaveCount(0)

  await expect.poll(async () => (await fare())?.service.completed, { timeout: 90000 }).toBe(1)
  const r = (await fare())?.care?.lastReceipt
  if (!r) throw new Error('a paid fare leaves a receipt')
  const bubble = page.getByTestId('pay-bubble').first()
  await expect(bubble).toBeVisible()
  await expect(bubble).toContainText(`+${r.net.toLocaleString('fr-FR')}`)
  await expect(bubble).toContainText(`course ${r.gross.toLocaleString('fr-FR')}`)
  await page.screenshot({ path: info.outputPath('taxi-paid-bubble.png') })
  // Gone a few seconds later: nothing stays over the street.
  await expect(page.getByTestId('pay-bubble')).toHaveCount(0, { timeout: 8000 })
  expect(errors).toEqual([])
})
