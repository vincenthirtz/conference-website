import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';
import dotenv from 'dotenv';

// Charge .env.local par défaut pour que les tests aient accès aux secrets locaux
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

const PORT = process.env.PORT || 3000;
const baseURL = process.env.TEST_BASE_URL || `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests',
  timeout: 120000,
  expect: {
    timeout: 10000,
  },
  use: {
    baseURL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'npm run dev -- --hostname 0.0.0.0 --port ' + PORT,
    url: baseURL,
    reuseExistingServer: true,
    timeout: 120000,
  },
});
