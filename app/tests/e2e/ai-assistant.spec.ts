import { test, expect } from '@playwright/test';

test.describe('AI Assistant UI', () => {
  test.beforeEach(async ({ page }) => {
    // Use page.request to share cookies with browser context
    const request = page.request;

    // Get CSRF token
    const csrfResponse = await request.get('/api/auth/csrf');
    console.log('CSRF Response status:', csrfResponse.status());
    const csrfData = await csrfResponse.json();
    console.log('CSRF Response data:', csrfData);
    const csrfToken = csrfData.data?.token;

    // Register a user via API
    const email = `test-${Date.now()}@example.com`;
    const registerResponse = await request.post('/api/auth/register', {
      data: { email, name: 'Test User', password: 'TestPass123!', confirmPassword: 'TestPass123!' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    console.log('Register Response status:', registerResponse.status());
    const registerBody = await registerResponse.json();
    console.log('Register Response body:', registerBody);
    expect(registerResponse.ok()).toBeTruthy();
    expect(registerBody.success).toBe(true);

    // Create a household via API
    const householdResponse = await request.post('/api/households', {
      data: { name: 'Test Household' },
      headers: { 'X-CSRF-Token': csrfToken },
    });
    console.log('Household Response status:', householdResponse.status());
    const householdBody = await householdResponse.json();
    console.log('Household Response body:', householdBody);
    expect(householdResponse.ok()).toBeTruthy();

    // Now go to the dashboard (should be authenticated via cookies)
    await page.goto('/pages/dashboard.html');
    await expect(page).toHaveURL('/pages/dashboard.html');
  });

  test('AI Assistant page loads successfully', async ({ page }) => {
    await page.goto('/pages/ai.html');
    await expect(page).toHaveURL('/pages/ai.html');

    // Wait for page to be fully loaded and JavaScript modules to execute
    await page.waitForLoadState('networkidle');

    // Verify page title
    await expect(page.locator('h1')).toContainText('AI Assistant');

    // Wait for conversations to load and empty state to be shown
    await expect(page.locator('[data-empty-state]')).toBeVisible({ timeout: 15000 });

    // Verify conversation list sidebar is visible
    await expect(page.locator('[data-conversation-list]')).toBeVisible();

    // Verify empty state is shown initially
    await expect(page.locator('[data-empty-state]')).toBeVisible();
    await expect(page.locator('[data-empty-state] p')).toContainText('No conversations yet');

    // Verify New Chat button is present
    await expect(page.locator('[data-new-conversation]')).toBeVisible();
  });

  test('Conversation list is displayed', async ({ page }) => {
    await page.goto('/pages/ai.html');

    // Check conversation list container exists
    const conversationList = page.locator('[data-conversations]');
    await expect(conversationList).toBeVisible();

    // Check conversation list title
    await expect(page.locator('.conversation-list-title')).toContainText('Conversations');
  });

  test('User can create a new conversation', async ({ page }) => {
    await page.goto('/pages/ai.html');

    // Click New Chat button
    await page.click('[data-new-conversation]');

    // Wait for conversation to load - empty state should be hidden, chat area shown
    await expect(page.locator('[data-empty-state]')).toBeHidden();
    await expect(page.locator('[data-chat-header]')).toBeVisible();
    await expect(page.locator('[data-input-area]')).toBeVisible();
    await expect(page.locator('[data-messages]')).toBeVisible();

    // Verify chat title shows
    await expect(page.locator('[data-chat-title]')).toBeVisible();

    // Verify message input is available
    await expect(page.locator('[data-message-input]')).toBeVisible();
    await expect(page.locator('[data-send-btn]')).toBeVisible();

    // Verify suggestion chips are shown
    await expect(page.locator('[data-suggestions]')).toBeVisible();
  });

  test('User can open an existing conversation', async ({ page }) => {
    await page.goto('/pages/ai.html');

    // Create first conversation
    await page.click('[data-new-conversation]');
    await expect(page.locator('[data-chat-header]')).toBeVisible();

    // Send a message to make it a real conversation
    await page.fill('[data-message-input]', 'Hello');
    await page.click('[data-send-btn]');

    // Wait for response (mock provider should respond)
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Go back to conversation list by clicking empty state or sidebar
    // The conversation should now appear in the list
    const conversationList = page.locator('[data-conversations]');
    await expect(conversationList.locator('button.conversation-item')).toBeVisible({ timeout: 5000 });

    // Create another conversation
    await page.click('[data-new-conversation]');
    await expect(page.locator('[data-chat-header]')).toBeVisible();

    // Fill in a different message
    await page.fill('[data-message-input]', 'Second conversation');
    await page.click('[data-send-btn]');
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Go back and check both conversations in list
    // Navigate away and back to refresh the list
    await page.goto('/pages/dashboard.html');
    await page.goto('/pages/ai.html');

    // Both conversations should be in the list
    const conversationItems = page.locator('[data-conversations] button.conversation-item');
    await expect(conversationItems).toHaveCount(2);
  });

  test('Message history is displayed correctly', async ({ page }) => {
    await page.goto('/pages/ai.html');
    await page.click('[data-new-conversation]');

    // Send first message
    await page.fill('[data-message-input]', 'First message');
    await page.click('[data-send-btn]');
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Verify user message appears
    await expect(page.locator('[data-messages] .message--user')).toContainText('First message');

    // Send second message
    await page.fill('[data-message-input]', 'Second message');
    await page.click('[data-send-btn]');
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Verify both messages appear
    const userMessages = page.locator('[data-messages] .message--user');
    await expect(userMessages).toHaveCount(2);
    await expect(userMessages.first()).toContainText('First message');
    await expect(userMessages.last()).toContainText('Second message');
  });

  test('Loading and error states work', async ({ page }) => {
    await page.goto('/pages/ai.html');
    // Create a new conversation first
    await page.click('[data-new-conversation]');
    // Wait for chat area to be visible
    await expect(page.locator('[data-chat-header]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-input-area]')).toBeVisible({ timeout: 10000 });

    // Verify loading state is initially hidden
    await expect(page.locator('[data-loading]')).toBeHidden();

    // Send message - loading should appear
    await page.fill('[data-message-input]', 'Test message');
    await page.click('[data-send-btn]');
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });

    // Wait for loading to complete
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Error state should be hidden by default
    await expect(page.locator('[data-error]')).toBeHidden();
  });

  test('Suggestion chips can populate the message input', async ({ page }) => {
    await page.goto('/pages/ai.html');
    await page.click('[data-new-conversation]');
    // Wait for chat area to be visible
    await expect(page.locator('[data-chat-header]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-input-area]')).toBeVisible({ timeout: 10000 });

    // Verify suggestion chips are visible
    const suggestionChips = page.locator('[data-suggestions] .suggestion-chip');
    await expect(suggestionChips.first()).toBeVisible({ timeout: 5000 });
    const count = await suggestionChips.count();
    expect(count).toBeGreaterThan(0);

    // Click a suggestion chip
    const firstSuggestion = page.locator('[data-suggestions] .suggestion-chip').first();
    const suggestionText = await firstSuggestion.textContent();
    await firstSuggestion.click();

    // Verify the message input is populated with the suggestion
    const messageInput = page.locator('[data-message-input]');
    await expect(messageInput).toHaveValue(suggestionText?.trim() || '');

    // Send button should be enabled
    await expect(page.locator('[data-send-btn]')).toBeEnabled();
  });

  test('Keyboard shortcuts work - Enter to send', async ({ page }) => {
    await page.goto('/pages/ai.html');
    await page.click('[data-new-conversation]');
    // Wait for chat area to be visible
    await expect(page.locator('[data-chat-header]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-input-area]')).toBeVisible({ timeout: 10000 });

    // Type message and press Enter
    await page.fill('[data-message-input]', 'Test with Enter key');
    await page.keyboard.press('Enter');

    // Verify message was sent (loading appears)
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });

    // Verify message appears
    await expect(page.locator('[data-messages] .message--user')).toContainText('Test with Enter key');
  });

  test('Shift+Enter creates new line', async ({ page }) => {
    await page.goto('/pages/ai.html');
    await page.click('[data-new-conversation]');
    // Wait for chat area to be visible
    await expect(page.locator('[data-chat-header]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-input-area]')).toBeVisible({ timeout: 10000 });

    // Type with Shift+Enter
    await page.fill('[data-message-input]', 'Line 1');
    await page.keyboard.press('Shift+Enter');
    await page.keyboard.type('Line 2');

    // Verify both lines are in the input
    await expect(page.locator('[data-message-input]')).toHaveValue('Line 1\nLine 2');
  });

  test('Responsive layout works on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/pages/ai.html');

    // Verify mobile layout - sidebar should be accessible but collapsed or hidden
    await expect(page.locator('.app-bottomnav')).toBeVisible();

    // Create a conversation
    await page.click('[data-new-conversation]');
    await expect(page.locator('[data-chat-header]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-input-area]')).toBeVisible({ timeout: 10000 });

    // Verify chat works on mobile
    await page.fill('[data-message-input]', 'Mobile test');
    await page.click('[data-send-btn]');
    await expect(page.locator('[data-loading]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-loading]')).toBeHidden({ timeout: 10000 });
  });

  test('Welcome screen is shown before first conversation', async ({ page }) => {
    await page.goto('/pages/ai.html');

    // Verify welcome screen is visible
    await expect(page.locator('[data-welcome]')).toBeVisible();
    await expect(page.locator('[data-welcome] h2')).toContainText('How can I help?');
    await expect(page.locator('[data-welcome] p')).toContainText('Start a new conversation');

    // Verify chat area is hidden
    await expect(page.locator('[data-chat-header]')).toBeHidden();
    await expect(page.locator('[data-input-area]')).toBeHidden();
    await expect(page.locator('[data-messages]')).toBeHidden();
  });

  test('Empty conversation list shows empty state', async ({ page }) => {
    await page.goto('/pages/ai.html');

    // Empty state should be visible
    await expect(page.locator('[data-empty-state]')).toBeVisible();
    await expect(page.locator('[data-empty-state] p')).toContainText('No conversations yet');
    await expect(page.locator('[data-new-conversation-empty]')).toBeVisible();

    // Click the empty state button should also create a conversation
    await page.click('[data-new-conversation-empty]');
    await expect(page.locator('[data-empty-state]')).toBeHidden();
    await expect(page.locator('[data-chat-header]')).toBeVisible();
  });
});