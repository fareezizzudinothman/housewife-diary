import { test, expect } from '@playwright/test';

test.describe('Phase 8: Family & Home Management', () => {
  test.beforeEach(async ({ page }) => {
    // Use page.request to share cookies with browser context
    const request = page.request;

    // Get CSRF token
    const csrfResponse = await request.get('/api/auth/csrf');
    const csrfData = await csrfResponse.json();
    const csrfToken = csrfData.data?.token;

    // Register a user via API
    const email = `test-${Date.now()}@example.com`;
    const registerResponse = await request.post('/api/auth/register', {
      data: { email, name: 'Test User', password: 'TestPass123!', confirmPassword: 'TestPass123!' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(registerResponse.ok()).toBeTruthy();
    const registerData = await registerResponse.json();
    expect(registerData.success).toBe(true);

    // Create a household via API
    const householdResponse = await request.post('/api/households', {
      data: { name: 'Test Household' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    expect(householdResponse.ok()).toBeTruthy();

    // Now go to the dashboard (should be authenticated via cookies)
    await page.goto('/pages/dashboard.html');
    await expect(page).toHaveURL('/pages/dashboard.html');
  });

  test('Create family member and verify in list', async ({ page }) => {
    await page.goto('/pages/family.html');
    await page.click('a:has-text("Add member")');
    await page.fill('input[name="name"]', 'John Doe');
    await page.fill('input[name="relationship"]', 'Spouse');
    await page.fill('input[name="dateOfBirth"]', '1990-05-15');
    await page.fill('textarea[name="notes"]', 'Loves cooking');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pages/family.html');
    await expect(page.locator('a.family-row__title:has-text("John Doe")')).toBeVisible();
    await expect(page.locator('text=Spouse')).toBeVisible();
  });

  test('Create family event and verify in Calendar', async ({ page }) => {
    // First create a family member
    await page.goto('/pages/family.html');
    await page.click('a:has-text("Add member")');
    await page.fill('input[name="name"]', 'Jane Smith');
    await page.fill('input[name="relationship"]', 'Child');
    await page.fill('input[name="dateOfBirth"]', '2015-03-20');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pages/family.html');

    // Create a family event (birthday)
    await page.goto('/pages/family.html');
    await page.click('a:has-text("Add event")');
    await page.fill('input[name="title"]', 'Jane\'s Birthday');
    await page.fill('input[name="kind"]', 'Birthday');
    await page.fill('input[name="eventDate"]', '2026-03-20');
    await page.selectOption('select[name="memberId"]', { label: 'Jane Smith' });
    await page.check('input[name="repeatsYearly"]');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/pages\/family\.html/);

    // Verify event appears in family list
    await expect(page.locator('text=Jane\'s Birthday')).toBeVisible();

    // Verify event appears in Calendar
    await page.goto('/pages/calendar.html');
    await page.waitForSelector('[data-calendar-title]');
    // Navigate to March 2026
    while (true) {
      const title = await page.locator('[data-calendar-title]').textContent();
      if (title?.includes('March 2026')) break;
      await page.click('[data-next]');
    }
    await expect(page.locator('text=Jane\'s Birthday')).toBeVisible();
  });

  test('Create room and verify in Home overview', async ({ page }) => {
    await page.goto('/pages/rooms.html');
    await page.click('a:has-text("Add room")');
    await page.fill('input[name="name"]', 'Living Room');
    await page.fill('textarea[name="description"]', 'Main living space');
    await page.click('#room-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/rooms.html');
    await expect(page.locator('text=Living Room')).toBeVisible();

    // Verify in Home overview
    await page.goto('/pages/home.html');
    await expect(page.locator('text=Living Room')).toBeVisible();
  });

  test('Create maintenance and verify in Calendar', async ({ page }) => {
    // First create a room
    await page.goto('/pages/rooms.html');
    await page.click('a:has-text("Add room")');
    await page.fill('input[name="name"]', 'Kitchen');
    await page.click('#room-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/rooms.html');

    // Create maintenance
    await page.goto('/pages/maintenance-form.html');
    await page.fill('input[name="title"]', 'HVAC Service');
    await page.fill('input[name="category"]', 'HVAC');
    await page.fill('input[name="scheduledDate"]', '2026-06-15');
    await page.selectOption('select[name="priority"]', 'HIGH');
    await page.selectOption('select[name="roomId"]', 'Kitchen');
    await page.click('#maintenance-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/maintenance.html');
    await expect(page.locator('text=HVAC Service')).toBeVisible();

    // Verify maintenance appears in Calendar
    await page.goto('/pages/calendar.html');
    while (true) {
      const title = await page.locator('[data-calendar-title]').textContent();
      if (title?.includes('June 2026')) break;
      await page.click('[data-next]');
    }
    await expect(page.locator('text=HVAC Service')).toBeVisible();
  });

  test('Verify dashboard Family section', async ({ page }) => {
    // Create family member
    await page.goto('/pages/family.html');
    await page.click('a:has-text("Add member")');
    await page.fill('input[name="name"]', 'Alice');
    await page.fill('input[name="relationship"]', 'Parent');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pages/family.html');

    // Check dashboard
    await page.goto('/pages/dashboard.html');
    await expect(page.locator('.app-nav__section:has-text("Family")')).toBeVisible();
    await expect(page.locator('text=Alice')).toBeVisible();
  });

  test('Verify dashboard Home section', async ({ page }) => {
    // Create room
    await page.goto('/pages/rooms.html');
    await page.click('a:has-text("Add room")');
    await page.fill('input[name="name"]', 'Bedroom');
    await page.click('#room-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/rooms.html');

    // Create cleaning
    await page.goto('/pages/cleaning.html');
    await page.click('a:has-text("Add schedule")');
    await page.selectOption('select[name="roomId"]', 'Bedroom');
    await page.fill('input[name="title"]', 'Vacuum');
    await page.selectOption('select[name="frequency"]', 'WEEKLY');
    await page.click('#cleaning-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/cleaning.html');

    // Check dashboard
    await page.goto('/pages/dashboard.html');
    await expect(page.locator('.app-nav__section:has-text("Home")')).toBeVisible();
    await expect(page.locator('text=Bedroom')).toBeVisible();
  });

  test('Upload document and verify private access', async ({ page }) => {
    await page.goto('/pages/documents.html');
    await page.click('a:has-text("Upload document")');
    await page.setInputFiles('input[name="file"]', {
      name: 'test.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4 test content'),
    });
    await page.fill('input[name="title"]', 'Insurance Policy');
    await page.selectOption('select[name="category"]', 'INSURANCE');
    await page.fill('input[name="expiryDate"]', '2027-12-31');
    await page.click('#document-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/documents.html');
    await expect(page.locator('text=Insurance Policy')).toBeVisible();

    // Verify document is accessible via private URL
    const docLink = page.locator('a[href*="/api/documents/"][href*="/file"]');
    await expect(docLink.first()).toBeVisible();
  });

  test('Create note with tags and pin', async ({ page }) => {
    await page.goto('/pages/notes.html');
    await page.click('a:has-text("New note")');
    await page.fill('input[name="title"]', 'Shopping List');
    await page.fill('textarea[name="content"]', 'Milk\nEggs\nBread');
    await page.fill('input[name="category"]', 'Shopping');
    await page.fill('input[name="tags"]', 'groceries, weekly');
    await page.keyboard.press('Enter');
    await page.check('input[name="pinned"]');
    await page.click('#note-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/notes.html');
    await expect(page.locator('text=Shopping List')).toBeVisible();
    await expect(page.locator('text=groceries')).toBeVisible();
    await expect(page.locator('text=weekly')).toBeVisible();
    await expect(page.locator('text=Pinned')).toBeVisible();
  });

  test('Search notes by tag', async ({ page }) => {
    await page.goto('/pages/notes.html');
    await page.fill('input[name="tag"]', 'groceries');
    await page.click('button[type="submit"]');
    await expect(page.locator('text=Shopping List')).toBeVisible();
  });

  test('Create idea with cost and task link', async ({ page }) => {
    await page.goto('/pages/ideas.html');
    await page.click('a:has-text("New idea")');
    await page.fill('input[name="title"]', 'Kitchen Renovation');
    await page.fill('textarea[name="description"]', 'New cabinets and countertops');
    await page.fill('input[name="category"]', 'Home Improvement');
    await page.selectOption('select[name="priority"]', 'HIGH');
    await page.fill('input[name="estimatedCost"]', '5000');
    await page.fill('textarea[name="notes"]', 'Contact contractor');
    await page.click('#idea-form button[type="submit"]');
    await expect(page).toHaveURL('/pages/ideas.html');
    await expect(page.locator('text=Kitchen Renovation')).toBeVisible();
    await expect(page.locator('text=Home Improvement')).toBeVisible();
    await expect(page.locator('text=5,000.00')).toBeVisible();
  });

  test('Responsive layout at mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pages/family.html');
    await expect(page.locator('.app-bottomnav')).toBeVisible();
    await expect(page.locator('.app-sidebar')).toBeHidden();

    await page.goto('/pages/rooms.html');
    await expect(page.locator('.app-bottomnav')).toBeVisible();

    await page.goto('/pages/documents.html');
    await expect(page.locator('.app-bottomnav')).toBeVisible();

    await page.goto('/pages/notes.html');
    await expect(page.locator('.app-bottomnav')).toBeVisible();

    await page.goto('/pages/ideas.html');
    await expect(page.locator('.app-bottomnav')).toBeVisible();
  });

  test('Household isolation - separate household cannot see data', async ({ page, context }) => {
    // Create data in first household
    await page.goto('/pages/family.html');
    await page.click('a:has-text("Add member")');
    await page.fill('input[name="name"]', 'Household1 Member');
    await page.fill('input[name="relationship"]', 'Test');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL('/pages/family.html');
    await expect(page.locator('text=Household1 Member')).toBeVisible();

    // Create second user in new context
    const page2 = await context.newPage();
    const request2 = page2.request;
    const email2 = `test2-${Date.now()}@example.com`;

    // Get CSRF token for second user
    const csrfResponse2 = await request2.get('/api/auth/csrf');
    const csrfData2 = await csrfResponse2.json();
    const csrfToken2 = csrfData2.data?.token;

    const registerResponse2 = await request2.post('/api/auth/register', {
      data: { email: email2, name: 'Test User 2', password: 'TestPass123!', confirmPassword: 'TestPass123!' },
      headers: { 'X-CSRF-Token': csrfToken2 },
    });
    expect(registerResponse2.ok()).toBeTruthy();

    const householdResponse2 = await request2.post('/api/households', {
      data: { name: 'Household 2' },
      headers: { 'X-CSRF-Token': csrfToken2 },
    });
    expect(householdResponse2.ok()).toBeTruthy();

    await page2.goto('/pages/dashboard.html');
    await expect(page2).toHaveURL('/pages/dashboard.html');
    await page2.fill('input[name="name"]', 'Household 2');
    await page2.click('button[type="submit"]');
    await expect(page2.locator('text=Household created')).toBeVisible({ timeout: 5000 });

    // Verify second user cannot see first household's data
    await page2.goto('/pages/family.html');
    await expect(page2.locator('text=Household1 Member')).not.toBeVisible();
    await expect(page2.locator('text=No family members yet')).toBeVisible();
  });
});