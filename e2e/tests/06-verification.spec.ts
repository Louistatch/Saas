import { test, expect } from '../fixtures/base.fixture'
import { VerifyPage } from '../pages/verify.page'
import { TEST_PREFIX } from '../helpers/constants'

test.describe('Scenario 6: QR Verification & Mobile', () => {
  test('valid card number shows "MEMBRE VÉRIFIÉ" with member details', async ({ page, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Verified`,
      lastName: `${TEST_PREFIX}Member`,
      phone: '+228 90 11 22 33',
    })
    const card = await testData.createCard(member.id, coopId)

    const verifyPage = new VerifyPage(page)
    await verifyPage.goto(card.card_number)

    // Should show valid status
    await verifyPage.expectValid()
    await verifyPage.expectMemberName(`${TEST_PREFIX}Verified`)
    await verifyPage.expectCardNumber(card.card_number)
  })

  test('invalid card number shows "CARTE INVALIDE" error', async ({ page }) => {
    const verifyPage = new VerifyPage(page)
    await verifyPage.goto('NONEXISTENT-99999')

    await verifyPage.expectInvalid()
    await verifyPage.expectErrorMessage('Carte non trouvée dans le système')
  })

  test('expired card shows "CARTE EXPIRÉE" status', async ({ page, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Expired`,
      lastName: `${TEST_PREFIX}Card`,
    })
    const card = await testData.createExpiredCard(member.id, coopId)

    const verifyPage = new VerifyPage(page)
    await verifyPage.goto(card.card_number)

    await verifyPage.expectExpired()
  })

  test('loading state shows spinner with "Vérification en cours..."', async ({ page, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Loading`,
      lastName: `${TEST_PREFIX}Test`,
    })
    const card = await testData.createCard(member.id, coopId)

    const verifyPage = new VerifyPage(page)

    // Navigate and immediately check for loading state
    await page.goto(`/verify/${encodeURIComponent(card.card_number)}`)

    // The loading state should be visible briefly
    await expect(page.getByText('Vérification en cours...')).toBeVisible({ timeout: 5_000 })

    // Then it should resolve
    await verifyPage.waitForResult()
  })

  test('verification page displays locality, phone, cooperative, and cotisation data', async ({ page, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}FullInfo`,
      lastName: `${TEST_PREFIX}Display`,
      phone: '+228 99 88 77 66',
    })
    const card = await testData.createCard(member.id, coopId)

    const verifyPage = new VerifyPage(page)
    await verifyPage.goto(card.card_number)
    await verifyPage.waitForResult()

    // Should display info sections
    await verifyPage.expectCooperativeDisplayed()
    await verifyPage.expectPhoneDisplayed()
    await verifyPage.expectCotisationsDisplayed()
    await verifyPage.expectFaîtiereHubBranding()
  })

  test.describe('Mobile viewport', () => {
    test.use({ viewport: { width: 375, height: 667 } })

    test('mobile viewport renders without horizontal scroll', async ({ page, testData }) => {
      const coopId = await testData.getCoopId('coop-admin@demo.local')
      if (!coopId) {
        test.skip(true, 'Could not determine cooperative ID')
        return
      }

      const member = await testData.createMember(coopId, {
        firstName: `${TEST_PREFIX}Mobile`,
        lastName: `${TEST_PREFIX}Test`,
      })
      const card = await testData.createCard(member.id, coopId)

      const verifyPage = new VerifyPage(page)
      await verifyPage.goto(card.card_number)
      await verifyPage.waitForResult()

      // Verify no horizontal scroll
      await verifyPage.expectNoHorizontalScroll()

      // All content should be visible
      await verifyPage.expectValid()
      await verifyPage.expectMemberName(`${TEST_PREFIX}Mobile`)
    })

    test('invalid card on mobile shows error correctly', async ({ page }) => {
      const verifyPage = new VerifyPage(page)
      await verifyPage.goto('MOBILE-INVALID-123')

      await verifyPage.expectInvalid()
      await verifyPage.expectNoHorizontalScroll()
    })
  })
})
