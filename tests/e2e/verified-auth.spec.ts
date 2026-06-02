import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

test.describe('Verified identity flow', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
    await page.route('**/api/auth/me/', async (route) => {
      await route.fulfill({ json: { user: null } });
    });
  });

  test('requests and verifies a producer identity', async ({ page }) => {
    await page.route('**/api/auth/request-code/', async (route) => {
      await route.fulfill({ json: { status: 'code_sent' } });
    });
    await page.route('**/api/auth/verify-code/', async (route) => {
      await route.fulfill({
        json: {
          id: 'verified-user-1',
          display_name: 'VerifiedProducer',
          email: 'verified@example.com',
          email_verified_at: '2026-04-30T00:00:00Z',
          elo_rating: 1200,
          elo_wins: 0,
          elo_losses: 0,
          elo_matches: 0,
        },
      });
    });

    await page.goto('/');
    await page.getByPlaceholder('email@example.com').fill('verified@example.com');
    await page.getByRole('button', { name: /Send Code/i }).click();
    await expect(page.getByText('Check your email for a verification code.')).toBeVisible();

    await page.getByPlaceholder('6-digit code').fill('123456');
    await page.getByPlaceholder('display name for new account').fill('VerifiedProducer');
    await page.getByRole('button', { name: /Verify Code/i }).click();

    await expect(page.getByText('Verified producer identity')).toBeVisible();
    await expect(page.getByTestId('player-name-input')).toHaveValue('VerifiedProducer');
    await expect(page.getByTestId('player-name-input')).toBeDisabled();
  });
});
