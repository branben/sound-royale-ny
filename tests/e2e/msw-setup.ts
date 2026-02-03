import { beforeAll, afterAll, beforeEach, afterEach } from '@playwright/test';
import { setupServer } from 'msw/node';
import { SetupServerApi } from 'msw/node';
import { http, HttpResponse } from 'msw';

// MSW setup for Playwright tests
export function setupMsw() {
  const server = setupServer(
    // Default handlers can be added here
  );
  
  // Establish MSW listeners before tests
  beforeAll(async () => {
    const serverApi = new SetupServerApi();
    await serverApi.setup();
  });

  // Clean up after tests
  afterAll(() => {
    server.close();
  });

  // Reset handlers before each test
  beforeEach(() => {
    server.resetHandlers();
  });

  return server;
}