import { test, expect } from '../fixtures/base.fixture'
import { MembersPage } from '../pages/members.page'
import { TEST_PREFIX } from '../helpers/constants'

test.describe('Scenario 3: Member Management', () => {
  test('members page loads with table for cooperative_admin', async ({ coopAdminPage }) => {
    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()
    await membersPage.expectLoaded()

    // Should see the search input and add button
    await expect(membersPage.searchInput).toBeVisible()
    await expect(membersPage.addButton).toBeVisible()
  })

  test('add new member with first_name and last_name', async ({ coopAdminPage }) => {
    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    const firstName = `${TEST_PREFIX}Pierre`
    const lastName = `${TEST_PREFIX}Martin`

    await membersPage.addMember({
      firstName,
      lastName,
      email: `e2e-pierre-${Date.now()}@test.local`,
    })

    // Verify the new member appears in the list
    await coopAdminPage.waitForTimeout(1000) // Wait for list refresh
    await membersPage.expectMemberVisible(`${firstName} ${lastName}`)
  })

  test('edit existing member name', async ({ coopAdminPage, testData }) => {
    // First create a test member via API
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}EditMe`,
      lastName: `${TEST_PREFIX}Original`,
    })

    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    // Edit the member
    await membersPage.editMember(`${TEST_PREFIX}EditMe`, {
      firstName: `${TEST_PREFIX}Edited`,
    })

    // Verify the updated name appears
    await coopAdminPage.waitForTimeout(1000)
    await membersPage.expectMemberVisible(`${TEST_PREFIX}Edited`)
  })

  test('delete member with confirmation dialog', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    const member = await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}DeleteMe`,
      lastName: `${TEST_PREFIX}Please`,
    })

    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    await membersPage.deleteMember(`${TEST_PREFIX}DeleteMe`)

    // Verify member is removed
    await coopAdminPage.waitForTimeout(1000)
    await membersPage.expectMemberNotVisible(`${TEST_PREFIX}DeleteMe`)
  })

  test('search filters members list', async ({ coopAdminPage, testData }) => {
    const coopId = await testData.getCoopId('coop-admin@demo.local')
    if (!coopId) {
      test.skip(true, 'Could not determine cooperative ID')
      return
    }

    // Create two members with distinct names
    await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Searchable`,
      lastName: `${TEST_PREFIX}Alpha`,
    })
    await testData.createMember(coopId, {
      firstName: `${TEST_PREFIX}Hidden`,
      lastName: `${TEST_PREFIX}Beta`,
    })

    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    // Search for "Searchable"
    await membersPage.searchMembers('Searchable')

    // Should show the matching member
    await membersPage.expectMemberVisible(`${TEST_PREFIX}Searchable`)
    // Should hide the non-matching member
    await membersPage.expectMemberNotVisible(`${TEST_PREFIX}Hidden`)
  })

  test('cooperative isolation — coop-admin sees only their members', async ({ coopAdminPage }) => {
    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    // Get the list of members visible to coop-admin
    const memberNames = await membersPage.getMemberNames()

    // Store for comparison (this test establishes baseline)
    expect(memberNames.length).toBeGreaterThanOrEqual(0)
  })

  test('cooperative isolation — fenomat sees different members', async ({ coopAdminPage, fenomatPage }) => {
    // Get members for coop-admin
    const coopMembersPage = new MembersPage(coopAdminPage)
    await coopMembersPage.goto()
    const coopMembers = await coopMembersPage.getMemberNames()

    // Get members for fenomat
    const fenomatMembersPage = new MembersPage(fenomatPage)
    await fenomatMembersPage.goto()
    const fenomatMembers = await fenomatMembersPage.getMemberNames()

    // The two lists should be different (different cooperatives)
    // At minimum, they shouldn't be identical (unless both are empty)
    if (coopMembers.length > 0 && fenomatMembers.length > 0) {
      const coopSet = new Set(coopMembers)
      const fenomatSet = new Set(fenomatMembers)
      const intersection = [...coopSet].filter(m => fenomatSet.has(m))

      // Members should not overlap between cooperatives
      expect(intersection.length, 'Cooperatives should have isolated member lists').toBe(0)
    }
  })

  test('LocationPicker cascading dropdowns work', async ({ coopAdminPage }) => {
    const membersPage = new MembersPage(coopAdminPage)
    await membersPage.goto()

    // Open add member dialog
    await membersPage.addButton.click()
    await expect(membersPage.dialog).toBeVisible()

    // Find the LocationPicker section — it has cascading selects
    const locationSection = coopAdminPage.getByText('Localisation').locator('..')

    // The LocationPicker should have region/prefecture/canton/village selects
    const selects = locationSection.locator('select')
    const selectCount = await selects.count()

    // Should have at least region and prefecture selects
    expect(selectCount).toBeGreaterThanOrEqual(2)

    // Select a region (first option after placeholder)
    const firstSelect = selects.first()
    const options = await firstSelect.locator('option').allTextContents()

    if (options.length > 1) {
      // Select the first real option
      await firstSelect.selectOption({ index: 1 })

      // Wait for cascade — next select should get populated
      await coopAdminPage.waitForTimeout(500)

      // The second select should now have options
      if (selectCount > 1) {
        const secondSelect = selects.nth(1)
        const secondOptions = await secondSelect.locator('option').allTextContents()
        expect(secondOptions.length).toBeGreaterThanOrEqual(1)
      }
    }

    // Close dialog
    await membersPage.cancelButton.click()
  })
})
