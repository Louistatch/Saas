import { enterLot, initialCityLife } from '../lib/haroolife/city/life'
import { landmarks } from '../lib/haroolife/city/world'
import { expect, test } from './lome-test'

/**
 * The university is a real amphitheatre on a real timetable: on Monday at 8 h the lecturer of
 * « Agronomie générale » teaches at the board, the students are seated, and the player follows
 * the lecture from the free seat (paid, skill +1). At lunch the room is empty and the next
 * lecture is announced.
 */
type City = { npcs: number; wallet: number; inside: string | null; lastEvent: string }

for (const [hour, label] of [
  [8, 'lecture'],
  [12, 'lunch'],
] as const)
  test(`university at ${hour} h (${label})`, async ({ page }, info) => {
    test.setTimeout(120_000)
    const errors: string[] = []
    page.on('pageerror', (e) => errors.push(e.message))
    const lot = landmarks().find((l) => l.type === 'university')
    if (!lot) throw new Error('Lomé has a university')
    const save = enterLot(initialCityLife(), lot)
    save.life.day = 1
    save.life.hour = hour
    save.life.wallet = 5000
    await page.addInitScript((save) => {
      if (sessionStorage.getItem('university-seeded')) return
      sessionStorage.setItem('university-seeded', '1')
      localStorage.setItem('haroolife.lome-city.v1', JSON.stringify(save))
    }, save)
    const city = () =>
      page.evaluate(() => (window as unknown as { __LOME_CITY?: City }).__LOME_CITY ?? null)
    await page.goto('/haroolife', { waitUntil: 'domcontentloaded' })
    await expect.poll(async () => (await city())?.inside, { timeout: 30000 }).toBe(lot.id)
    await expect(page.locator('canvas:visible').first()).toBeVisible({ timeout: 30000 })
    if (hour === 8) {
      // Lecturer + 9 students + secretary.
      await expect.poll(async () => (await city())?.npcs).toBe(11)
      await page.waitForTimeout(1500)
      await page.screenshot({ path: info.outputPath('amphi-lecture.png') })
      await page.getByRole('button', { name: /^Activités/ }).click()
      const timetable = page.getByTestId('timetable')
      await expect(timetable).toContainText('Emploi du temps · lundi')
      await expect(timetable.locator('[aria-current="true"]')).toContainText(
        'Agronomie générale · Pr Ama Kpodar · en cours',
      )
      await expect(timetable).toContainText('12 h–14 h · pause déjeuner')
      await page
        .getByRole('button', { name: /Suivre le cours : Agronomie générale \(8 h–10 h\)/ })
        .first()
        .click()
      await expect.poll(async () => (await city())?.wallet, { timeout: 20000 }).toBe(4000)
      await expect
        .poll(async () => (await city())?.lastEvent)
        .toContain('Agronomie générale avec Pr Ama Kpodar')
    } else {
      // The secretary and one student revising.
      await expect.poll(async () => (await city())?.npcs).toBe(2)
      await page.waitForTimeout(1500)
      await page.screenshot({ path: info.outputPath('amphi-lunch.png') })
    }
    expect(errors).toEqual([])
  })
