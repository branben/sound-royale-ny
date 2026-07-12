import { test, expect } from '@playwright/test';
import { enableE2EMode } from './helpers';

const BACKEND_URL = 'http://localhost:8000';

test.describe('Webhook', () => {
  test.beforeEach(async ({ page }) => {
    await enableE2EMode(page);
  });

  test('GET /webhooks/linear/ returns health check', async ({ page }) => {
    const response = await page.request.get(`${BACKEND_URL}/webhooks/linear/`);

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe('ok');
    expect(json.webhook).toBe('linear-gaia-bridge');
  });

  test('POST /api/webhooks/linear/ with valid payload enqueues task', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const webhookPayload = {
      type: 'IssueCreated',
      data: {
        id: 'test-issue-123',
        identifier: 'SR-TEST',
        title: 'Test webhook',
        description: 'Test desc',
        state: { name: 'Todo' },
        labels: [],
        url: 'https://linear.app/issue/SR-TEST',
      },
    };

    const response = await page.request.post(`${BACKEND_URL}/webhooks/linear/`, {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe('enqueued');
    expect(json.gaia_task_id).toBeDefined();
    expect(json.linear_issue).toBe('SR-TEST');
    expect(json.priority).toBe(3);
  });

  test('POST /api/webhooks/linear/ with urgent label uses higher priority', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const webhookPayload = {
      type: 'IssueCreated',
      data: {
        id: 'test-issue-456',
        identifier: 'SR-URGENT',
        title: 'Urgent bug fix',
        description: 'Critical issue',
        state: { name: 'Todo' },
        labels: [{ name: 'urgent' }],
        url: 'https://linear.app/issue/SR-URGENT',
      },
    };

    const response = await page.request.post(`${BACKEND_URL}/webhooks/linear/`, {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe('enqueued');
    expect(json.priority).toBe(2);
  });

  test('POST /api/webhooks/linear/ ignores done/canceled states', async ({ page }) => {
    test.fixme(true); // tracked: e2e test rot — issue #169
    const webhookPayload = {
      type: 'IssueUpdated',
      data: {
        id: 'test-issue-789',
        identifier: 'SR-DONE',
        title: 'Completed task',
        description: 'This is done',
        state: { name: 'Done' },
        labels: [],
        url: 'https://linear.app/issue/SR-DONE',
      },
    };

    const response = await page.request.post(`${BACKEND_URL}/webhooks/linear/`, {
      data: webhookPayload,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(200);

    const json = await response.json();
    expect(json.status).toBe('ignored');
    expect(json.reason).toContain('state=done');
  });

  test.skip('POST /webhooks/linear/ rejects invalid JSON', async ({ page }) => {
    const response = await page.request.post(`${BACKEND_URL}/webhooks/linear/`, {
      data: 'not valid json',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    expect(response.status()).toBe(400);

    const json = await response.json();
    expect(json.error).toBe('Invalid JSON');
  });
});
